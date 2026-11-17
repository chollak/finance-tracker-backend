/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { pwaManifest } from './pwaManifest'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      // The app's only manifest (FT-257), in its own module: the tests read the object, not this file (#217)
      manifest: pwaManifest,
      workbox: {
        // Cache strategies. No rule for `/api/` (#322): the worker passes every API request to the network and never
        // answers one itself — a slow server is waited for, not replaced by an old copy. Without connection the app
        // opens on the reads it keeps per user (FT-129, `shared/lib/offline`). The cache an earlier version filled is
        // deleted by the app at every start and at «Выйти» or a lost session (`dropLegacyApiCache`)
        runtimeCaching: [
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
  test: {
    env: {
      // A local .env.local may name a dev user for `npm run dev:full`; tests must not run as that user
      // (src/shared/config/env.test.ts). A test that needs one mocks `env` itself
      VITE_MOCK_USER_ID: '',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // API_PROXY_TARGET lets a test run use its own backend port while the live instance holds 3000
        // (`.claude/launch.json`, docs/tasks/README.md «Как проверяем»)
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Names the browser it forwards for: the dev header counts only for a browser on this machine, not for a
        // phone on the Wi-Fi with `vite --host` (isLocalRequest)
        xfwd: true,
      },
    },
  },
  build: {
    outDir: '../public/webapp',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Each screen loads its own piece (#291), named after its page — `page-home-*.js`, not one more `index-*.js`:
        // in the build's list and in a «Failed to fetch dynamically imported module» in the log
        chunkFileNames: (chunk) => {
          const page = chunk.facadeModuleId?.match(/[\\/]src[\\/]pages[\\/]([^\\/]+)[\\/]index\.tsx?$/)?.[1]
          return page ? `assets/page-${page}-[hash].js` : 'assets/[name]-[hash].js'
        },
        manualChunks: {
          // React and router
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // TanStack Query
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Increase limit slightly for vendor chunks
  },
})
