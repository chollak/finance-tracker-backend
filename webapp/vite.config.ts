/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { pastelColors } from './src/shared/config/pastelTokens'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      // The app's only manifest (FT-257): the plugin writes it as manifest.webmanifest and links it in index.html
      manifest: {
        name: 'Kapelka',
        short_name: 'Kapelka',
        description: 'Записывайте траты и доходы голосом и текстом',
        start_url: '/',
        display: 'standalone',
        // A manifest has one colour per field, not one per theme: the light `bg` of «Пастель», the default theme.
        // index.html and ThemeController set <meta name="theme-color"> to the `bg` of the theme in use
        background_color: pastelColors.light.bg,
        theme_color: pastelColors.light.bg,
        orientation: 'portrait',
        // The bars of the sign on a black square, inside the maskable safe zone (FT-169). Not icon.svg: that is the
        // tab's silhouette, for 16–32px only
        icons: [
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
            // API calls - Network First with fallback. Not the login and the session (FT-128): an answer about who is
            // signed in must never come from a cache. Nor the health check: the offline mode asks it whether the server
            // is there at all (FT-129)
            urlPattern: /^https?:\/\/[^/]+\/api\/(?!auth\/|health).*/i,
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
        manualChunks: {
          // React and router
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // TanStack Query
          'query-vendor': ['@tanstack/react-query'],
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
