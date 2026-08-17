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
import { applyTheme, getLangPref, getThemePref, loadActiveUser } from './db/db'
import { setLang } from './lib/i18n'
import './index.css'
import { loadExerciseNames } from './lib/exerciseNames'

/*
 * Обновление приложения.
 *
 * autoUpdate ставит новую версию сам, но уже открытая вкладка продолжает
 * работать на старом коде: service worker не может подменить то, что
 * браузер уже выполнил. А проверку он делает только при регистрации, то
 * есть при загрузке страницы. Приложение держат открытым сутками — и
 * человек всё это время видит вчерашнюю версию, не понимая, почему
 * обещанного нет.
 *
 * Поэтому спрашиваем сами: при возвращении на вкладку и раз в десять
 * минут. Когда новая версия встала у руля, перезагружаем страницу —
 * данные лежат в IndexedDB и переживают это без потерь.
 *
 * Service worker есть не везде (например, при раздаче одним файлом) —
 * приложение должно запускаться и без него.
 */
try {
  const update = registerSW({ immediate: true })

  if ('serviceWorker' in navigator) {
    // Смена контроллера означает, что новая версия активировалась.
    // Перезагрузку делаем один раз: без флага браузер может зациклиться.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })
  }

  const check = () => {
    // Проверка сама по себе ничего не ломает: если версия та же, ничего и
    // не произойдёт.
    void update(true).catch(() => {})
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  setInterval(check, 10 * 60_000)
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
  // Тему применяем до рендера, иначе экран моргнёт чужим цветом.
  .then(async () => {
    applyTheme(await getThemePref())
    // Язык — до рендера: иначе первый кадр выходит на одном языке, а
    // второй на другом, и это видно.
    setLang(await getLangPref())
    // Названия упражнений — тоже до рендера: подгрузи их после, и список
    // каталога на секунду остался бы русским, а потом дёрнулся.
    await loadExerciseNames()
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
