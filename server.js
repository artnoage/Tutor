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
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
const apiProxy = createProxyMiddleware({
  target: backendUrl,
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
app.post('/api/process_audio', upload.single('audio'), (req, res) => {
  console.log('Received audio processing request');
  
  // Forward the request to the backend
  const forwardUrl = `${backendUrl}/process_audio`;
  
  // Create a new FormData object to send to the backend
  const formData = new FormData();
  if (req.file) {
    const audioBlob = new Blob([req.file.buffer], { type: 'audio/wav' });
    formData.append('audio', audioBlob, 'recording.wav');
  }
  
  if (req.body.data) {
    formData.append('data', req.body.data);
  }
  
  // Forward the request
  fetch(forwardUrl, {
    method: 'POST',
    body: formData
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    res.json(data);
  })
  .catch(error => {
    console.error('Error forwarding request to backend:', error);
    res.status(500).json({ error: 'Failed to process audio: ' + error.message });
  });
});

// Use proxy for other API routes
app.use('/api', apiProxy);

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API requests will be proxied to ${backendUrl}`);
});
