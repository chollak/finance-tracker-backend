import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/webapp/',
  root: '.', // Explicitly set root to current directory
  build: {
    outDir: '../public/webapp',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html', // Explicitly specify input file
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
