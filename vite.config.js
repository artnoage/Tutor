import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'esnext', // This enables top-level await support
    outDir: 'dist',
    assetsDir: 'assets'
  },
  esbuild: {
    target: 'esnext', // Ensure esbuild also targets modern browsers
  },
  server: {
    port: 8002,
    host: '0.0.0.0',
    cors: true,
    allowedHosts: ['www.metaskepsis.com'],
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..', '.']
    },
    watch: {
      usePolling: true
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      'js': resolve(__dirname, './js')
    }
  },
  base: './',
  publicDir: 'public'
});
