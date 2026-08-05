import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// HashRouter, а не BrowserRouter: приложение должно одинаково работать и на
// собственном домене, и при раздаче одним файлом со статик-хостинга, где
// сервер не умеет переписывать глубокие маршруты на index.html.
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppProvider } from './store/app'
import { repairCatalogIds, seedIfEmpty, syncCatalogPrograms } from './db/seed'
import { restoreSession } from './db/account'
import { applyAccent, applyTheme, getAccentPref, getThemePref, loadActiveUser } from './db/db'
import './index.css'

// Service worker есть не везде (например, при раздаче одним файлом) —
// приложение должно запускаться и без него.
try {
  registerSW({ immediate: true })
} catch {
  /* офлайн-кеш недоступен, данные всё равно лежат в IndexedDB */
}

// Каталог упражнений и программы кладём в IndexedDB, а активный аккаунт
// поднимаем до первого рендера — иначе экраны стартуют не от того профиля.
seedIfEmpty()
  .then(repairCatalogIds)
  // Программы каталога, появившиеся в новой версии, досылаем и тем, у кого
  // база уже собрана: иначе обновление не приносит им ничего нового.
  .then(syncCatalogPrograms)
  .then(loadActiveUser)
  // Если человек уже входил, поднимаем его аккаунт и запускаем обмен с
  // сервером до рендера: иначе экраны на мгновение покажут чужой профиль.
  .then(restoreSession)
  // Тему и акцент применяем до рендера, иначе экран моргнёт чужим цветом.
  .then(async () => {
    applyTheme(await getThemePref())
    applyAccent(await getAccentPref())
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <HashRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </StrictMode>,
    )
  })
