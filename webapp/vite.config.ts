import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  return {
    plugins: [react()],
    base: isDevelopment ? '/' : '/webapp/',
    root: '.',
    server: {
      port: 5173,
      proxy: isDevelopment ? {
        // Proxy API calls to local backend during development
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        }
      } : undefined
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
      __DEV_MODE__: isDevelopment,
      __API_BASE__: isDevelopment ? '"/api"' : '"/api"'
    }
  };
});
