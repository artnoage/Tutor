import { defineConfig } from 'vite';

// Custom plugin to prevent client injection
const preventClientInjection = () => {
  return {
    name: 'prevent-client-injection',
    transformIndexHtml(html) {
      // Remove any Vite client script tags
      return html.replace(/<script(\s+)type="module"(\s+)src="[^"]*\/@vite\/client[^"]*"><\/script>/g, '');
    }
  };
};

export default defineConfig({
  plugins: [preventClientInjection()],
  build: {
    target: 'esnext', // This enables top-level await support
    outDir: 'dist',
    assetsDir: '', // Place assets directly in the output directory
    emptyOutDir: false, // Prevent Vite from emptying the output directory
    rollupOptions: {
      input: {
        main: './index.html',
        'tutor-core': './js/tutor-core.js',
        'tutor-ui-helpers': './js/tutor-ui-helpers.js',
        'tutor-ui': './js/tutor-ui.js',
        'sidebar-resize': './js/sidebar-resize.js',
        'audio-manager': './js/audio-manager.js',
        'api-service': './js/api-service.js'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        manualChunks: undefined
      }
    }
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
  base: './', // Use relative paths for production
  publicDir: 'public', // Serve files from the public directory
  // Log more details for debugging
  logLevel: 'info',
  // Disable client injection
  cacheControl: 'no-store',
  // Explicitly disable client injection
  optimizeDeps: {
    exclude: ['@vite/client']
  },
  // Force production mode to disable development features
  mode: 'production',
  // Disable all dev-specific features
  define: {
    'process.env.NODE_ENV': '"production"',
    '__VUE_PROD_DEVTOOLS__': 'false'
  }
});
