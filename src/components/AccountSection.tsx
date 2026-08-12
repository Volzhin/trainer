import { useEffect, useState } from 'react'
import { db, currentUserId } from '../db/db'
import { authUser, deleteAccount, logout, onAuthChange } from '../lib/backend'
import { leaveDemoMode } from '../db/account'
import { stopSync, syncNow } from '../db/sync'
import { useApp } from '../store/app'
import { Sheet } from './Sheet'
import { t } from '../lib/i18n'

/**
 * Аккаунт: вход, режим работы и удаление.
 *
 * Один блок на оба приложения — клиентское и тренерское. Настройки аккаунта
 * человек ищет в одном месте независимо от того, в какой роли он сейчас
 * находится, и разводить их по двум разным экранам значит прятать.
 */
export function AccountSection() {
  const { toast } = useApp()
  const [user, setUser] = useState(authUser())
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => onAuthChange(setUser), [])

  if (!user) {
    return (
      <>
        <div className="section-title">{t('Аккаунт')}</div>
        <button
          className="group-row"
          onClick={() => {
            leaveDemoMode()
            location.reload()
          }}
        >
          <span className="grow">
            <span className="title">{t('Войти или зарегистрироваться')}</span>
            <span className="sub">
              Сейчас данные лежат только на этом устройстве
            </span>
          </span>
        </button>
      </>
    )
  }

  const isTrainer = user.role === 'trainer'

  const sync = async () => {
    setBusy(true)
    const res = await syncNow()
    setBusy(false)
    toast(
      res
        ? `Отправлено ${res.pushed}, получено ${res.pulled}`
        : 'Нет связи с сервером — попробуем позже',
    )
  }


  const exit = () => {
    stopSync()
    logout()
    // Демо-режим здесь включать нельзя: человек нажал «выйти», а увидел бы
    // чужие показательные тренировки и решил, что это его данные.
    leaveDemoMode()
    location.reload()
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteAccount()
      await wipeLocal(user.id)
      stopSync()
      leaveDemoMode()
      location.reload()
    } catch {
      toast('Не удалось удалить аккаунт')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-title">{t('Аккаунт')}</div>
      <div className="group">
        <button className="group-row" onClick={sync} disabled={busy}>
          <span className="grow">
            <span className="title">{user.email}</span>
            <span className="sub">
              {busy ? 'Синхронизация…' : 'Нажмите, чтобы синхронизировать сейчас'}
            </span>
          </span>
        </button>

        <button className="group-row" onClick={exit}>
          <span className="grow">
            <span className="title">{t('Выйти')}</span>
            <span className="sub">
              Данные останутся на сервере
            </span>
          </span>
        </button>

        <button className="group-row danger" onClick={() => setConfirmOpen(true)}>
          <span className="grow">
            <span className="title">{t('Удалить аккаунт')}</span>
            <span className="sub">
              Безвозвратно, вместе со всеми данными
            </span>
          </span>
        </button>
      </div>

      <Sheet open={confirmOpen} title={t('Удалить аккаунт')} onClose={() => setConfirmOpen(false)}>
        <div className="stack">
          <div className="card">
            Удалим всё: тренировки, замеры, питание, программы и связь с
            {isTrainer ? ' клиентами' : ' тренером'}. Восстановить будет нечем — резервной копии
            вашего аккаунта у нас не остаётся.
          </div>
          <div className="field">
            <label>{t('Введите слово «удалить», чтобы подтвердить')}</label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoCapitalize="none"
              placeholder={t('удалить')}
            />
          </div>
          <button
            className="btn danger block"
            disabled={confirmText.trim().toLowerCase() !== t('удалить') || busy}
            onClick={remove}
          >
            {busy ? t('Удаляю…') : t('Удалить навсегда')}
          </button>
          <button className="btn block" onClick={() => setConfirmOpen(false)}>
            Отмена
          </button>
        </div>
      </Sheet>
    </>
  )
}

/**
 * Стирает данные удалённого аккаунта с устройства. Без этого они остались бы
 * в IndexedDB после того, как на сервере их уже нет — то есть удаление было
 * бы неполным.
 */
async function wipeLocal(userId: string) {
  const owned = ['sessions', 'bodyMetrics', 'foodLogs'] as const
  for (const name of owned) {
    await db.table(name).where('user_id').equals(userId).delete()
  }

  // Подходы висят на тренировках, а не на пользователе — чистим по ссылке.
  const sessionIds = new Set(
    (await db.sessions.where('user_id').equals(userId).primaryKeys()) as string[],
  )
  if (sessionIds.size) {
    await db.sets.filter((s) => sessionIds.has(s.workout_session_id)).delete()
  }

  await db.links.filter((l) => l.client_id === userId || l.trainer_id === userId).delete()
  await db.assignments.filter((a) => a.client_id === userId || a.trainer_id === userId).delete()
  await db.feedback.filter((f) => f.client_id === userId || f.trainer_id === userId).delete()
  await db.trainerNotes
    .filter((n) => n.client_id === userId || n.trainer_id === userId)
    .delete()
  await db.programs.filter((p) => p.author_id === userId || p.client_id === userId).delete()
  await db.nutritionProfile.delete(userId)
  await db.profile.delete(userId)
  await db.syncQueue.clear()

  if (currentUserId() === userId) {
    await db.appState.delete('state')
  }
}
