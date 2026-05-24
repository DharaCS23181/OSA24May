import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
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
      '/dw': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
      // '/analytics-studio': {
      //   target: 'http://mvpanalytics.onestopanalytics.com:5174',
      //   changeOrigin: true,
      // },
    },
  },
})
