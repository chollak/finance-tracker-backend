import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Finance Tracker',
        short_name: 'Finance',
        description: 'Track your income and expenses easily',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F5F7',
        theme_color: '#1C1C1E',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['finance', 'productivity'],
        lang: 'ru',
      },
      workbox: {
        // Cache strategies
        runtimeCaching: [
          {
            // API calls - Network First with fallback
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Static assets - Cache First
            urlPattern: /\.(js|css|png|jpg|jpeg|svg|woff2?)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
        // Don't cache the index.html for SPA routing
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false, // Disable PWA in dev mode
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: '../public/webapp',
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
