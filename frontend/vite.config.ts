import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_URL = process.env.VITE_API_URL
const sameHost = process.env.VITE_API_SAME_HOST === 'true'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: sameHost
      ? {
          '/api': { target: 'http://nginx', changeOrigin: true },
          '/ws': {
            target: 'ws://backend:8000',
            ws: true,
            changeOrigin: true,
          },
        }
      : {
          '/api': { target: API_URL, changeOrigin: true, secure: false },
        },
    host: true,
    port: 5173,
  },
})
