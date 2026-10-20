import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api로 시작하는 요청은 서버(8000)로 넘깁니다. (D-008)
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
