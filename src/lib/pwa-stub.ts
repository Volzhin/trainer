/** Заглушка регистрации service worker для сборки без PWA-плагина. */
export function registerSW(_options?: unknown) {
  // Возвращает ту же функцию проверки обновления, что и настоящий модуль,
  // — вызывающий код не должен знать, работает он с ней или с заглушкой.
  return (_reloadPage?: boolean) => Promise.resolve()
}
