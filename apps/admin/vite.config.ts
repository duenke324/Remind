import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Duas páginas: o painel (index.html) e a página de compra do Remind Pro (pro.html, servida em /pro).
// O painel é servido pelo próprio servidor (mesma origem que a API), em /admin e em admin.remind.uno.
// Em desenvolvimento, os pedidos /api vão para o servidor local.
const proxy = { '/api': { target: process.env.REMIND_API ?? 'http://localhost:8787', changeOrigin: false } }

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5174, proxy },
  preview: { port: 4174, proxy },
  build: { outDir: 'dist', sourcemap: false, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), pro: resolve(__dirname, 'pro.html') } } }
})
