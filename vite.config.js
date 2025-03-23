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
  "API_URL": "/tutor/api"
}, null, 2);

// Write config to both locations
fs.writeFileSync(configPath, configContent);
fs.writeFileSync(publicConfigPath, configContent);

// Copy necessary files to public directory
const filesToCopy = [
  { src: 'index.html', dest: 'public/index.html' },
  { src: 'styles.css', dest: 'public/styles.css' }
];

// Create js directory in public if it doesn't exist
if (!fs.existsSync(resolve(__dirname, 'public/js'))) {
  fs.mkdirSync(resolve(__dirname, 'public/js'), { recursive: true });
  console.log('Created public/js directory');
}

// Copy all JS files from js directory to public/js
const jsDir = resolve(__dirname, 'js');
if (fs.existsSync(jsDir)) {
  const jsFiles = fs.readdirSync(jsDir);
  jsFiles.forEach(file => {
    if (file.endsWith('.js')) {
      fs.copyFileSync(
        resolve(jsDir, file),
        resolve(__dirname, 'public/js', file)
      );
      console.log(`Copied js/${file} to public/js/${file}`);
    }
  });
}

for (const file of filesToCopy) {
  if (fs.existsSync(resolve(__dirname, file.src))) {
    fs.copyFileSync(
      resolve(__dirname, file.src),
      resolve(__dirname, file.dest)
    );
    console.log(`Copied ${file.src} to ${file.dest}`);
  }
}

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
    hmr: false, // Disable HMR completely
    allowedHosts: 'all', // Allow all hosts
    proxy: {
      // Proxy API requests to the backend server
      '/tutor/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tutor\/api/, ''),
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
  base: '/tutor/',
  publicDir: 'public',
  // Log more details for debugging
  logLevel: 'info'
});
