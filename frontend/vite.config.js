import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
      '/catalogs': 'http://localhost:8000',
      '/sizes': 'http://localhost:8000',
      '/colors': 'http://localhost:8000',
      '/products': 'http://localhost:8000',
      '/variants': 'http://localhost:8000',
      '/inventory': 'http://localhost:8000',
      '/orders': 'http://localhost:8000',
      '/analytics': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    }
  }
})
