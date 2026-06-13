import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sentry from '@sentry/astro';
import cloudflare from '@astrojs/cloudflare';
import { fileURLToPath } from 'url';

// https://astro.build/config
export default defineConfig({
  site: 'https://takeoutfix.pages.dev',
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare'
  }),
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
    ssr: {
      external: ['@sentry/astro', '@astrojs/cloudflare'],
      optimizeDeps: {
        exclude: [
          '@astrojs/cloudflare',
          '@sentry/astro',
          'react-router-dom',
          'lucide-react',
          'firebase',
          'framer-motion',
          'piexifjs'
        ]
      }
    },
    optimizeDeps: {
      exclude: [
        '@astrojs/cloudflare',
        '@sentry/astro',
        'react-router-dom',
        'lucide-react',
        'firebase',
        'framer-motion',
        'piexifjs'
      ]
    }
  }
});
