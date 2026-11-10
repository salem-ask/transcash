/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Modes :
// - (défaut)  build de production pour Hostinger → dist/ (l'API PHP est copiée dans dist/api)
// - preview   un seul fichier HTML en mode démo → preview/index.html (prévisualisation artefact)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'preview' ? [viteSingleFile()] : [])],
  build: mode === 'preview' ? { outDir: 'preview', emptyOutDir: true } : { outDir: 'dist', emptyOutDir: true },
  server: {
    // En développement, l'API PHP tourne sur le port 8000 (npm run api)
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: { include: ['src/**/*.test.ts'] },
}))
