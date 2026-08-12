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
        /**
         * Английские названия и описания упражнений — почти мегабайт, и
         * нужны они только тем, кто переключил язык. В предзагрузку не
         * берём: иначе этот мегабайт скачивает каждый, включая тех, кто
         * никогда не увидит английский. Офлайн он всё равно доступен —
         * кладём в кеш при первом обращении, правилом ниже.
         */
        globIgnores: ['**/exercises.en.json'],
        // Справочник больше стандартного лимита — иначе выпадет из офлайн-кеша.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Запросы к API подменять страницей нельзя: открытая напрямую ссылка
        // на файл вернула бы index.html вместо самого файла.
        navigateFallbackDenylist: [/^\/api\//],
        /**
         * Фоновой очереди POST здесь намеренно нет.
         *
         * Workbox повторял каждый неудавшийся POST сутки, а приложение
         * повторяет их само (см. db/sync.ts) — загрузка видео уезжала дважды
         * и создавала второе вложение. Вдобавок в очередь попадал вход по
         * паролю: запрос лежал в IndexedDB вместе с паролем и повторялся
         * потом со стороны Service Worker.
         */
        runtimeCaching: [
          {
            // Английский словарь — тот самый файл из globIgnores выше.
            urlPattern: /\/data\/exercises\.en\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-names-en',
              expiration: { maxEntries: 2 },
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
