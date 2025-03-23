import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Ensure config.json exists in both the root and public directories
const configPath = resolve(__dirname, 'config.json');
const publicConfigPath = resolve(__dirname, 'public', 'config.json');

// Create the public directory if it doesn't exist
if (!fs.existsSync(resolve(__dirname, 'public'))) {
  fs.mkdirSync(resolve(__dirname, 'public'), { recursive: true });
  console.log('Created public directory');
}

// Create or update the config files
const configContent = JSON.stringify({
  "API_URL": "/api"
}, null, 2);

fs.writeFileSync(configPath, configContent);
fs.writeFileSync(publicConfigPath, configContent);
console.log('Created/updated config.json files in root and public directories');

export default defineConfig({
  build: {
    target: 'esnext', // This enables top-level await support
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: false // Prevent Vite from emptying the output directory
  },
  esbuild: {
    target: 'esnext', // Ensure esbuild also targets modern browsers
  },
  server: {
    port: 8002,
    host: '0.0.0.0',
    cors: true,
    hmr: {
      // Disable WebSocket connection for HMR
      protocol: 'http',
      host: 'localhost',
      port: 8002
    },
    allowedHosts: ['www.metaskepsis.com'],
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://0.0.0.0:8080', // Use 0.0.0.0 instead of localhost
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          // Additional proxy configuration
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
            res.writeHead(500, {
              'Content-Type': 'text/plain'
            });
            res.end('Proxy error: ' + err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', req.method, req.url);
          });
        }
      }
    }
  },
  base: './',
  publicDir: './'
});
