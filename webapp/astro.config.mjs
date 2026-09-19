import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'url';
import cloudflare from '@astrojs/cloudflare';

const srcPath = fileURLToPath(new URL('./src', import.meta.url)).replace(/\\/g, '/');

// https://astro.build/config
export default defineConfig({
  site: 'https://takeoutfix.pages.dev',
  output: 'server',
  redirects: {
    // Legacy subfolder routes smoothly redirected to clean canonical URLs
    '/marketing/download': '/download',
    '/marketing/pricing': '/pricing',
    '/marketing/reviews': '/reviews',
    '/marketing/restore-data': '/restore-data',
    '/legal/privacy': '/privacy',
    '/legal/terms': '/terms',
    '/legal/refund': '/refund',
    '/user/dashboard': '/dashboard',
    '/user/profile': '/profile',
    '/user/checkout': '/checkout',
    '/auth/login': '/login',
    '/auth/signup': '/signup',
  },
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  build: {
    format: 'file'
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover'
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: true
    })
  ],
  vite: {
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    build: {
      sourcemap: false,
      minify: 'esbuild',
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': srcPath,
      }
    },
    optimizeDeps: {
      exclude: [
        'astro:transitions',
        'astro/virtual-modules/transitions',
        'astro/virtual-modules/transitions.js',
        'astro/virtual-modules/transitions-router.js',
        'astro/virtual-modules/transitions-types.js',
        'astro/virtual-modules/transitions-events.js',
        'astro/virtual-modules/transitions-swap-functions.js',
        '@uswriting/exiftool',
        '@sentry/astro',
        '@emailjs/browser',
      ],
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
      ]
    },
    ssr: {
      external: [
        '@sentry/astro',
        '@uswriting/exiftool',
      ],
      noExternal: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'firebase',
        'framer-motion',
        'piexifjs',
      ]
    }
  }
});
