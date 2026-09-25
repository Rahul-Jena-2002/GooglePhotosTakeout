import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'url';
import cloudflare from '@astrojs/cloudflare';

const srcPath = fileURLToPath(new URL('./src', import.meta.url)).replace(/\\/g, '/');

// ─── Layer 1: Restoration Engine Obfuscation ──────────────────────────────
// Targets ONLY chunks that contain restoration service code.
// Domain-locked to production domain — any tampering or off-domain execution
// is blocked. Base64 string encryption ensures zero UTF-8 decoding issues
// during client-side hydration. UI and React chunks are explicitly exempted.
function restorationObfuscatorPlugin() {
  const RESTORATION_PATTERN = /services[\\/]restoration[\\/]/;
  const UI_OR_REACT_PATTERN = /(?:react-pages|components|contexts|layouts|node_modules)[\\/]/;

  return {
    name: 'takeoutfix-restoration-obfuscator',
    apply: 'build', // Only active during production builds, not dev server
    async renderChunk(code, chunk) {
      // Only obfuscate dedicated restoration engine chunks; NEVER touch UI / React chunks
      const moduleIds = Object.keys(chunk.modules || {});
      const hasRestorationCode = moduleIds.some(id => RESTORATION_PATTERN.test(id));
      const hasUiCode = moduleIds.some(id => UI_OR_REACT_PATTERN.test(id));
      if (!hasRestorationCode || hasUiCode) return null;

      try {
        const { default: JavaScriptObfuscator } = await import('javascript-obfuscator');
        const result = JavaScriptObfuscator.obfuscate(code, {
          target: 'browser',

          // ── Domain Lock (Layer 1a) ──────────────────────────────────────
          // Code will silently break if loaded from any unauthorized domain
          domainLock: ['takeoutfix.pages.dev', 'takeoutfix.com', 'www.takeoutfix.com', 'localhost', '127.0.0.1'],
          domainLockRedirectUrl: 'about:blank',

          // ── Base64 String Encryption (Layer 1b) ─────────────────────────
          // Base64 encoding avoids UTF-8 URI malformed issues under Vite minification
          stringArray: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.9,
          stringArrayWrappersCount: 2,
          stringArrayWrappersType: 'function',

          // ── Identifier Obfuscation ──────────────────────────────────────
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,      // Keep global names safe (don't break window/document)

          // ── Output ─────────────────────────────────────────────────────
          compact: true,
          sourceMap: false,          // Never emit source maps for protected code

          // Disabled intentionally — too heavy for a processing-intensive engine:
          // controlFlowFlattening: false (would slow down restoration 3-5x)
          // deadCodeInjection: false  (would increase bundle size 30%+)
        });

        console.log(`[Layer 1] Obfuscated restoration chunk: ${chunk.fileName}`);
        return { code: result.getObfuscatedCode(), map: null };
      } catch (err) {
        console.warn('[Layer 1] Obfuscation skipped for chunk:', chunk.fileName, err.message);
        return null;
      }
    }
  };
}

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
    '/auth/desktop': '/login',
    '/auth': '/login',
  },
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  build: {
    format: 'file'
  },
  prefetch: {
    prefetchAll: false,
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('services/restoration') || id.includes('services\\restoration')) {
              return 'restoration-engine';
            }
          }
        }
      }
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
    },
    plugins: [restorationObfuscatorPlugin()],
  }
});
