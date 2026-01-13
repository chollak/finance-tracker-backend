import path from "path"
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // In dev server, command is 'serve', in build, command is 'build'
  const isDevelopment = command === 'serve' || mode === 'development';
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: '/', // Always serve from root now
    root: '.',
    server: {
      port: 5173,
      proxy: {
        // Always proxy API calls to local backend during development
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      outDir: '../public/webapp',
      emptyOutDir: true,
      rollupOptions: {
        input: 'index.html',
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom']
          }
        }
      }
    },
    define: {
      // Make environment mode available to the app
      __DEV_MODE__: JSON.stringify(isDevelopment),
      __API_BASE__: JSON.stringify('/api')
    }
  };
});
