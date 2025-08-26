import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_URL = process.env.VITE_API_URL
const sameHost = process.env.VITE_API_SAME_HOST === 'true'
// Enable polling-based file watching for Docker on Windows/macOS where FS events may not propagate
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true' || process.env.WATCHPACK_POLLING === 'true'
const pollingInterval = Number(process.env.CHOKIDAR_INTERVAL || '300')
// Public tunnel/hostname support (e.g., ngrok). Optional.
const publicHost = process.env.VITE_PUBLIC_HOST
const publicProtocol = process.env.VITE_PUBLIC_PROTOCOL
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT ? Number(process.env.VITE_HMR_CLIENT_PORT) : undefined
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

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
    watch: {
      usePolling,
      interval: pollingInterval,
    },
    // Allow external hosts (e.g., meeter.ngrok.dev) to reach dev server through a reverse proxy
    ...(allowedHosts.length ? { allowedHosts } : {}),
    // If a public host/protocol is provided (like an HTTPS tunnel), configure HMR to use it
    ...(publicHost
      ? {
          hmr: {
            host: publicHost,
            protocol: publicProtocol === 'https' ? 'wss' : 'ws',
            ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
          },
        }
      : {}),
  },
})
