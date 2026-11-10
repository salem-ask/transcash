/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'

// Modes :
// - (défaut)  build de production pour Hostinger → dist/ (l'API PHP est copiée dans dist/api)
// - preview   un seul fichier HTML en mode démo → preview/index.html (prévisualisation artefact)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'preview'
      ? [viteSingleFile()]
      : [
          // Application installable (Android, ordinateur) qui démarre sans réseau.
          // Les données hors connexion sont gérées par src/data/offline.ts, pas par le service worker.
          VitePWA({
            registerType: 'autoUpdate',
            filename: 'sw.js',
            includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
            manifest: {
              name: 'TransCash',
              short_name: 'TransCash',
              description: 'Suivi des versements journaliers des chauffeurs',
              lang: 'fr',
              start_url: './',
              scope: './',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#f7f9f8',
              theme_color: '#0f7a55',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
              navigateFallback: 'index.html',
              navigateFallbackDenylist: [/\/api\//],
              // L'API n'est jamais mise en cache par le service worker
              runtimeCaching: [],
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            },
          }),
        ]),
  ],
  build: mode === 'preview' ? { outDir: 'preview', emptyOutDir: true } : { outDir: 'dist', emptyOutDir: true },
  server: {
    // En développement, l'API PHP tourne sur le port 8000 (npm run api)
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: { include: ['src/**/*.test.ts'] },
}))
