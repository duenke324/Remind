import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// O painel é servido pelo próprio servidor (mesma origem que a API), em /admin e em admin.remind.uno.
// Em desenvolvimento, os pedidos /api vão para o servidor local.
const proxy = { '/api': { target: process.env.REMIND_API ?? 'http://localhost:8787', changeOrigin: false } }

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5174, proxy },
  preview: { port: 4174, proxy },
  build: { outDir: 'dist', sourcemap: false }
})
