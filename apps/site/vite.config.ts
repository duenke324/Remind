import { defineConfig } from 'vite'

export default defineConfig({
  // Caminhos relativos: o site funciona na raiz do domínio ou dentro de uma pasta.
  base: './',
  build: {
    // A cena 3D (Three.js, ~135 KB comprimidos) é carregada à parte, depois do texto já estar no ecrã.
    chunkSizeWarningLimit: 600
  }
})
