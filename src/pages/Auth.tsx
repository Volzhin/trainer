import { useState } from 'react'
import {
  ApiError,
  MAIL_ENABLED,
  login,
  register,
  requestPasswordReset,
  sessionDropReason,
} from '../lib/backend'
import { useApp } from '../store/app'
import { adoptAccount, enterDemoMode, firstExchange } from '../db/account'
import { startSync } from '../db/sync'
import { IconChevronRight } from '../components/Icons'

/**
 * Вход и регистрация.
 *
 * Один экран на оба действия: разводить их по разным страницам значит
 * заставлять человека искать нужную. Роль спрашивается только при
 * регистрации и определяет, какое приложение он увидит — дневник или
 * кабинет тренера.
 */

type Mode = 'login' | 'register' | 'reset'

export function Auth({ onReady }: { onReady: () => void }) {
  const { switchTo } = useApp()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'client' | 'trainer'>('client')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email)
        setSent(true)
        return
      }

      const isNew = mode === 'register'
      const user = isNew
        ? await register({ email, password, name, role })
        : await login(email, password)

      const { fresh } = await adoptAccount(user)
      // Приложение читает данные от имени активного аккаунта. Без этого
      // переключения экраны остались бы на прежнем профиле — человек входит
      // и видит «Гость», пока не перезагрузит страницу.
      await switchTo(user.id)
      // Первичный обмен идёт фоном: держать человека на кнопке «Секунду…»,
      // пока выгружается история тренировок, — верный способ его потерять.
      void firstExchange(user, fresh, isNew)
      startSync()
      onReady()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Нет связи с сервером')
    } finally {
      setBusy(false)
    }
  }

  const demo = () => {
    enterDemoMode()
    onReady()
  }

  // Если сессия оборвалась сама, человек должен понимать почему, а не
  // гадать, куда делся его аккаунт.
  const dropped = sessionDropReason()

  const canSubmit =
    mode === 'reset'
      ? email.includes('@')
      : email.includes('@') &&
        password.length >= 8 &&
        (mode === 'login' || name.trim().length > 0)

  return (
    <div className="screen auth">
      <div className="auth-head">
        <div className="auth-mark" aria-hidden />
        <h1>Тренировки</h1>
        <p className="sub">
          {mode === 'register'
            ? 'Заведите аккаунт — данные будут доступны на всех ваших устройствах.'
            : mode === 'reset'
              ? 'Пришлём письмо со ссылкой для нового пароля.'
              : 'Войдите, чтобы дневник и замеры синхронизировались.'}
        </p>
      </div>

      {mode === 'register' && (
        <div className="field">
          <label>Вы здесь как</label>
          <div className="segmented">
            <button className={role === 'client' ? 'on' : ''} onClick={() => setRole('client')}>
              Занимаюсь
            </button>
            <button
              className={role === 'trainer' ? 'on' : ''}
              onClick={() => setRole('trainer')}
            >
              Тренирую
            </button>
          </div>
          <div className="mute-sm" style={{ marginTop: 6 }}>
            {role === 'client'
              ? 'Дневник тренировок, замеры и питание.'
              : 'Кабинет с клиентами, программами и обратной связью.'}
          </div>
        </div>
      )}

      {mode === 'register' && (
        <div className="field">
          <label>Как вас зовут</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Имя"
          />
        </div>
      )}

      <div className="field">
        <label>Почта</label>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mail@example.com"
        />
      </div>

      {mode !== 'reset' && (
        <div className="field">
          <label>Пароль</label>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="не короче 8 символов"
          />
        </div>
      )}

      {!error && dropped && <div className="auth-note">{dropped}</div>}
      {error && <div className="auth-error">{error}</div>}
      {sent && (
        <div className="auth-note">
          Письмо отправлено на {email}. Если его нет, проверьте папку со спамом.
        </div>
      )}

      <button className="btn primary block" disabled={!canSubmit || busy} onClick={submit}>
        {busy
          ? 'Секунду…'
          : mode === 'register'
            ? 'Создать аккаунт'
            : mode === 'reset'
              ? 'Отправить письмо'
              : 'Войти'}
      </button>

      <div className="auth-switch">
        {mode === 'login' && (
          <>
            <button className="link" onClick={() => setMode('register')}>
              Создать аккаунт
            </button>
            {MAIL_ENABLED && (
              <button className="link" onClick={() => setMode('reset')}>
                Забыли пароль
              </button>
            )}
          </>
        )}
        {mode !== 'login' && (
          <button
            className="link"
            onClick={() => {
              setMode('login')
              setSent(false)
              setError('')
            }}
          >
            Уже есть аккаунт — войти
          </button>
        )}
      </div>

      <button className="group-row auth-demo" onClick={demo}>
        <span className="grow">
          <span className="title">Посмотреть без регистрации</span>
          <span className="sub" style={{ display: 'block' }}>
            Демо-данные на этом устройстве, ничего не уходит на сервер
          </span>
        </span>
        <span className="chevron">
          <IconChevronRight size={16} />
        </span>
      </button>
    </div>
  )
}
