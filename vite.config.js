import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Requires an explicit user click (via src/components/PwaUpdatePrompt.jsx)
      // before a new service worker takes over — this is a multi-user,
      // per-year-locked finance system, so a background 'autoUpdate' that
      // silently reloads mid-edit is not acceptable here.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icon-source.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '利澤國小基金預算管理系統',
        short_name: '利澤基金',
        description: '利澤國小基金預算管理系統－縣議會審查用',
        lang: 'zh-Hant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F5F3EE',
        theme_color: '#1F5F52',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: '/index.html',
        // Firebase Hosting reserves /__/auth/** for the Google-sign-in popup
        // handler (see signInWithPopup in src/contexts/AuthContext.jsx) —
        // never let the SPA-fallback intercept it.
        navigateFallbackDenylist: [/^\/__\//],
        // Deliberately no runtimeCaching entries: the service worker only
        // precaches the app shell (JS/CSS/HTML/icons) for fast reload and
        // installability. Firestore's onSnapshot channel and Firebase Auth
        // requests must never be intercepted/cached here — doing so risks
        // masking data staleness or conflicting with the locking/audit
        // invariants in src/lib/yearDataRepository.js. Read resilience on
        // flaky connections is handled separately via Firestore's own
        // persistentLocalCache in src/firebase.js.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
  },
});
