import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api and /media are proxied to Django so the browser sees one
// origin, the same way the Vercel rewrite works in production.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
})
