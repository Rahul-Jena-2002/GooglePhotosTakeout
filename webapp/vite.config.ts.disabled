import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('firebase/app') || id.includes('firebase/auth')) {
            return 'firebase-core';
          }
          if (id.includes('firebase/firestore')) {
            return 'firebase-db';
          }
          if (id.includes('framer-motion')) {
            return 'framer';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          if (id.includes('@radix-ui') || id.includes('lucide-react')) {
            return 'ui-radix';
          }
        }
      }
    }
  }
})
