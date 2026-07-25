import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'מסך בית כנסת',
        short_name: 'מסך כנסת',
        description: 'מסך תצוגה לבתי כנסת — זמנים, תפילות והודעות',
        theme_color: '#1a3a4a',
        background_color: '#f7f5f0',
        display: 'fullscreen',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        runtimeCaching: [
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
