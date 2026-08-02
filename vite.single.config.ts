import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

/**
 * Сборка в один HTML-файл — для раздачи ссылки без сервера и без CDN.
 * Service worker здесь не подключается: офлайн-кеш даёт полноценный хостинг,
 * а данные всё равно живут в IndexedDB устройства.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: {
      // Плагина PWA в этой сборке нет — подменяем виртуальный модуль заглушкой.
      'virtual:pwa-register': fileURLToPath(new URL('./src/lib/pwa-stub.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
