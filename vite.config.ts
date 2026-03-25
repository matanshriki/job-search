import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { careerFetchDevProxy } from './vite-plugin-career-fetch-proxy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/job-search/',
  plugins: [react(), tailwindcss(), careerFetchDevProxy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
