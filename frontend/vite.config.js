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
      // ── ETL Backend (port 8111) — /etl/* ──────────────────────────────────
      '/etl': {
        target: 'http://localhost:8111',
        changeOrigin: true,
        ws: true,
      },

      // ── Analytics Backend (port 8010) — /analytics/* ──────────────────────
      '/analytics': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },

      // ── DW Backend (port 8004) — /dw/* ────────────────────────────────────
      '/dw': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
