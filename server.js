const express = require('express');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8002;

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Proxy API requests to backend server
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
const apiProxy = createProxyMiddleware('/api', {
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
