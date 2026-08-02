/** Заглушка регистрации service worker для сборки без PWA-плагина. */
export function registerSW(_options?: unknown) {
  return () => Promise.resolve()
}
