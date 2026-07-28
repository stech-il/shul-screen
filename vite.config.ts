import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cloudApiPlugin } from './vite.cloudPlugin';

const orefProxy = {
  '/api/oref/alerts': {
    target: 'https://www.oref.org.il',
    changeOrigin: true,
    secure: true,
    rewrite: () => '/WarningMessages/alert/alerts.json',
    headers: {
      Referer: 'https://www.oref.org.il/',
      'X-Requested-With': 'XMLHttpRequest',
    },
  },
};

export default defineConfig({
  plugins: [
    react(),
    cloudApiPlugin(),
    VitePWA({
      // 'prompt' avoids the plugin's automatic full-page reload (that flashes kiosks).
      // We claim updates ourselves in main.tsx — skip reload on live display routes.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'screensmart-mark.png'],
      manifest: {
        name: 'screensmart',
        short_name: 'screensmart',
        description: 'screensmart — מסך תצוגה לבתי כנסת: זמנים, תפילות והודעות',
        theme_color: '#0f1c22',
        background_color: '#0f1c22',
        display: 'fullscreen',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/cloud\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'cloud-api',
            },
          },
          {
            urlPattern: /\/api\/billing\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'billing-api',
            },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api-cache',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 30 },
              networkTimeoutSeconds: 6,
            },
          },
          {
            urlPattern: /^https:\/\/www\.hebcal\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hebcal-api-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /\/api\/oref\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'oref-alerts',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: orefProxy },
  preview: { proxy: orefProxy },
});
