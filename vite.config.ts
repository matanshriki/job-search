import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { careerFetchDevProxy } from './vite-plugin-career-fetch-proxy'

export default defineConfig({
  plugins: [react(), tailwindcss(), careerFetchDevProxy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
