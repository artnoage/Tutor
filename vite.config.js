import { defineConfig } from 'vite';



export default defineConfig({
  build: {
    target: 'esnext', // This enables top-level await support
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: false // Prevent Vite from emptying the output directory
  },
  esbuild: {
    target: 'esnext' // Ensure esbuild also targets modern browsers
  },
  server: {
    port: 8002,
    host: '0.0.0.0',
    cors: true,
    hmr: false, // Disable HMR completely
    ws: false, // Disable WebSocket connection completely
    allowedHosts: ['www.metaskepsis.com', 'metaskepsis.com', 'all'], // Explicitly allow metaskepsis.com
    strictPort: true, // Don't try another port if 8002 is in use
    proxy: {
      // Proxy API requests to your backend server
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          // Additional proxy configuration
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
            if (res.writeHead) {
              res.writeHead(500, {
                'Content-Type': 'text/plain'
              });
              res.end('Proxy error: ' + err.message);
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', req.method, req.url);
          });
        }
      }
    }
  },
  base: './', // Use relative paths instead of empty base
  publicDir: './', // Serve files from the root directory
  // Log more details for debugging
  logLevel: 'info',
  // Disable client injection
  cacheControl: 'no-store',
  // Explicitly disable client injection
  optimizeDeps: {
    exclude: ['@vite/client']
  }
});
