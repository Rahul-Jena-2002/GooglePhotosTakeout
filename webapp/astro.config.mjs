import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sentry from '@sentry/astro';
import { fileURLToPath } from 'url';

// https://astro.build/config
export default defineConfig({
  site: 'https://takeoutfix.com',
  output: 'static',
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
