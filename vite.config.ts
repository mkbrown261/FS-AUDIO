import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: {
      // Force Vite to bundle CommonJS modules like lamejs properly
      include: [/lamejs/, /node_modules/],
    },
  },
  optimizeDeps: {
    include: ['lamejs'],
  },
  server: {
    port: 5173,
  },
})
