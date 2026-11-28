import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api and /media are proxied to Django, so the session cookie is first-party,
// exactly as with the Vercel rewrite in production.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
})
