import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174, // Отличный от старого webapp (5173)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: '../public/webapp-v2', // Временно отдельная папка
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React and router
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // TanStack Query
          'query-vendor': ['@tanstack/react-query'],
          // Charts library (heavy)
          'charts-vendor': ['recharts'],
          // Form libraries
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // UI components
          'ui-vendor': ['lucide-react', 'date-fns'],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Increase limit slightly for vendor chunks
  },
})
