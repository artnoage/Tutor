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
    allowedHosts: ['www.metaskepsis.com'],
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  base: './',
  publicDir: './',
  // Ensure config.json is properly served
  assetsInclude: ['**/*.json']
});
