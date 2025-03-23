import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Ensure config.json exists
const configPath = resolve(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    "API_URL": "http://localhost:8080"
  }, null, 2));
  console.log('Created default config.json file');
}

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
    allowedHosts: ['www.metaskepsis.com']
  },
  base: './',
  publicDir: './',
  // Ensure config.json is properly served
  assetsInclude: ['**/*.json']
});
