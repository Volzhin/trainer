import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // На GitHub Pages приложение живёт в подкаталоге репозитория,
  // поэтому базовый путь задаётся переменной окружения при сборке.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Trainer — дневник тренировок',
        short_name: 'Trainer',
        description: 'Оффлайн-первый трекер силовых тренировок',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Справочник больше стандартного лимита — иначе выпадет из офлайн-кеша.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Пример фонового POST-очереди для будущего REST API (Workbox Background Sync)
            urlPattern: /\/api\/.*/,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'trainer-sync-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        /**
         * Воркер pdf.js приезжает из пакета с расширением .mjs, и на этом
         * ломался разбор отчётов: nginx не знает такого расширения и отдаёт
         * файл как application/octet-stream, а модуль с не-JS MIME браузер
         * исполнять отказывается. Плюс .mjs не попадал в globPatterns
         * Workbox, то есть офлайн разбор не работал и подавно.
         *
         * Чиним на своей стороне, а не в конфиге сервера: тогда починка
         * едет вместе со сборкой и не теряется при переезде на другую машину.
         */
        assetFileNames: (info) => {
          const source = info.names?.[0] ?? info.name ?? ''
          if (source.endsWith('.mjs')) return 'assets/[name]-[hash].js'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
  server: { port: 5173, host: true },
})
