import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro';
import { fileURLToPath } from 'url';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false
    }),
    sentry({
      sourceMapsUploadOptions: {
        enabled: false
      }
    })
  ],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    ssr: {
      external: ['@sentry/astro']
    }
  }
});
