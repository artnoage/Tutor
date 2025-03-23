const express = require('express');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 8002;

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Configure proxy middleware
const backendUrl = process.env.BACKEND_URL || '/tutor/api';
const apiProxy = createProxyMiddleware({
  target: 'http://localhost:8080',
  changeOrigin: true,
  pathRewrite: {
    '^/api': ''
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Backend server unavailable' });
  }
});

// Handle audio processing specifically
app.post('/api/process_audio', upload.single('audio'), async (req, res) => {
  console.log('Received audio processing request');
  
  try {
    // Forward the request to the backend
    const forwardUrl = `http://localhost:8080/process_audio`;
    
    // Create a FormData-like object for node-fetch
    const FormData = require('form-data');
    const form = new FormData();
    
    // Add the audio file if it exists
    if (req.file) {
      form.append('audio', req.file.buffer, {
        filename: 'recording.wav',
        contentType: 'audio/wav'
      });
    }
    
    // Add the data if it exists
    if (req.body.data) {
      form.append('data', req.body.data);
    }
    
    // Forward the request
    const fetch = require('node-fetch');
    const response = await fetch(forwardUrl, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend error: ${response.status} - ${errorText}`);
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error forwarding request to backend:', error);
    res.status(500).json({ error: 'Failed to process audio: ' + error.message });
  }
});

// Use proxy for other API routes
app.use('/api', apiProxy);

// Also handle the /tutor/api route for direct access
app.use('/tutor/api', createProxyMiddleware({
  target: 'http://localhost:8080',
  changeOrigin: true,
  pathRewrite: {
    '^/tutor/api': ''
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Backend server unavailable' });
  }
}));

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API requests will be proxied to ${backendUrl}`);
});
