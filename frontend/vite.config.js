import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, './src/modules/etl/components/ui'),
      '@services': path.resolve(__dirname, './src/shared/services'),
    },
  },
  server: {
    proxy: {
      // ── ETL Backend (port 8111) ───────────────────────────────────────────
      '/etl/api': {
        target: 'http://localhost:8111',
        changeOrigin: true,
      },
      '/etl/ws': {
        target: 'ws://localhost:8111',
        changeOrigin: true,
        ws: true,
      },

      // ── Analytics Backend (port 8010) ─────────────────────────────────────
      '/analytics/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
      // Legacy Analytics API routes
      '/api': {
        target: 'http://localhost:8010/analytics',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },

      // ── DW Backend (port 8004) ────────────────────────────────────────────
      '/dw/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
