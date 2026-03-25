import { copyFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { careerFetchDevProxy } from './vite-plugin-career-fetch-proxy'

export default defineConfig({
  base: '/job-search/',
  plugins: [
    react(),
    tailwindcss(),
    careerFetchDevProxy(),
    {
      name: 'github-pages-spa-404',
      closeBundle() {
        const out = path.resolve(__dirname, 'dist/index.html')
        copyFileSync(out, path.resolve(__dirname, 'dist/404.html'))
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
