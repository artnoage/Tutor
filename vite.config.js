import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext', // This enables top-level await support
  },
  esbuild: {
    target: 'esnext', // Ensure esbuild also targets modern browsers
  },
  server: {
    port: 8002,
    host: '0.0.0.0',
    cors: true
  }
});
