import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  build: {
    chunkSizeWarningLimit: 1000, // Sube el límite a 1000 kB (1 MB) para que no avise
  },
})
