import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sentry from '@sentry/astro';
import { fileURLToPath } from 'url';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://takeoutfix.pages.dev',
  output: 'hybrid',
  adapter: cloudflare(),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false
    })
  ],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'framer-motion',
        'piexifjs',
        '@sentry/astro'
      ]
    },
    ssr: {
      external: ['@sentry/astro'],
      noExternal: process.env.NODE_ENV === 'production' ? [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'firebase',
        'framer-motion',
        'piexifjs'
      ] : []
    }
  }
});
