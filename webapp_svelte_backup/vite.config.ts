import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('firebase/app') || id.includes('firebase/auth') || id.includes('firebase/firestore')) {
            return 'vendor-firebase';
          }
        }
      }
    }
  },
  worker: {
    format: 'es',
  },
})
