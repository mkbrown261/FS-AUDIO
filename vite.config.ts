import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    commonjsOptions: {
      // Force Vite to bundle CommonJS modules like lamejs properly
      include: [/lamejs/, /node_modules/],
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split large plugin files into separate async chunks
          if (id.includes('src/components/plugins/AiPlugins')) return 'AiPlugins'
          if (id.includes('src/components/plugins/FlowstatePro')) return 'FlowstatePro'
          if (id.includes('src/components/plugins/BuiltInPlugins')) return 'BuiltInPlugins'
          // Split heavy audio libraries
          if (id.includes('essentia') || id.includes('meyda')) return 'audio-analysis'
          if (id.includes('peaks.js') || id.includes('waveform-data')) return 'waveform'
          // Keep React in its own chunk
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          // Zustand
          if (id.includes('node_modules/zustand')) return 'zustand'
        },
      },
    },
  },
  optimizeDeps: {
    include: ['lamejs'],
  },
  server: {
    port: 5173,
  },
})
