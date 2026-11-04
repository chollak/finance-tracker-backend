import type { ManifestOptions } from 'vite-plugin-pwa'
import { pastelColors } from './src/shared/config/pastelTokens'

/**
 * The app's only manifest (FT-257): vite.config.ts hands it to VitePWA(), which writes it as manifest.webmanifest and
 * links it in index.html. A module of its own so tests/kapelkaSign.test.ts reads the object, not the config's text (#217)
 */
export const pwaManifest: Partial<ManifestOptions> = {
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
}
