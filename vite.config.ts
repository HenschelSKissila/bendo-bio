import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'BENDO BIO — Produits frais livrés',
        short_name: 'BENDO BIO',
        description: 'Boutique en ligne et gestion BENDO BIO : commandes, créneaux, stocks.',
        theme_color: '#1f5130',
        background_color: '#f7f8f3',
        display: 'standalone',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        importScripts: ['push-handler.js'],   // notifications push (public/push-handler.js)
        // les données Supabase ne sont jamais mises en cache (toujours à jour)
        runtimeCaching: [
          { urlPattern: ({ url }) => url.hostname.endsWith('supabase.co') && url.pathname.includes('/storage/'),
            handler: 'CacheFirst', options: { cacheName: 'product-images', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } } },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
})
