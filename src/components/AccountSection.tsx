import { useEffect, useState } from 'react'
import { db, currentUserId, now } from '../db/db'
import { authUser, deleteAccount, logout, onAuthChange, updateAccount } from '../lib/backend'
import { leaveDemoMode } from '../db/account'
import { stopSync, syncNow } from '../db/sync'
import { useApp } from '../store/app'
import { Sheet } from './Sheet'

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
        <div className="section-title">Аккаунт</div>
        <button
          className="group-row"
          onClick={() => {
            leaveDemoMode()
            location.reload()
          }}
        >
          <span className="grow">
            <span className="title">Войти или зарегистрироваться</span>
            <span className="sub" style={{ display: 'block' }}>
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

  /**
   * Смена режима. Один человек часто и тренирует, и тренируется сам:
   * заводить ради этого второй аккаунт значит разрывать его собственную
   * историю тренировок пополам.
   */
  const switchRole = async () => {
    const next = isTrainer ? 'client' : 'trainer'
    setBusy(true)
    try {
      await updateAccount({ role: next })
      await db.profile.update(user.id, {
        role: next === 'trainer' ? 'TRAINER' : 'CLIENT',
        updated_at: now(),
      })
      location.reload()
    } catch {
      toast('Не удалось переключить режим')
      setBusy(false)
    }
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
      <div className="section-title">Аккаунт</div>
      <div className="group">
        <button className="group-row" onClick={sync} disabled={busy}>
          <span className="grow">
            <span className="title">{user.email}</span>
            <span className="sub" style={{ display: 'block' }}>
              {busy ? 'Синхронизация…' : 'Нажмите, чтобы синхронизировать сейчас'}
            </span>
          </span>
        </button>

        <button className="group-row" onClick={switchRole} disabled={busy}>
          <span className="grow">
            <span className="title">
              {isTrainer ? 'Перейти в режим занимающегося' : 'Перейти в режим тренера'}
            </span>
            <span className="sub" style={{ display: 'block' }}>
              {isTrainer
                ? 'Свой дневник, замеры и питание'
                : 'Клиенты, программы и обратная связь'}
            </span>
          </span>
        </button>

        <button className="group-row" onClick={exit}>
          <span className="grow">
            <span className="title">Выйти</span>
            <span className="sub" style={{ display: 'block' }}>
              Данные останутся на сервере
            </span>
          </span>
        </button>

        <button className="group-row danger" onClick={() => setConfirmOpen(true)}>
          <span className="grow">
            <span className="title">Удалить аккаунт</span>
            <span className="sub" style={{ display: 'block' }}>
              Безвозвратно, вместе со всеми данными
            </span>
          </span>
        </button>
      </div>

      <Sheet open={confirmOpen} title="Удалить аккаунт" onClose={() => setConfirmOpen(false)}>
        <div className="stack">
          <div className="card">
            Удалим всё: тренировки, замеры, питание, программы и связь с
            {isTrainer ? ' клиентами' : ' тренером'}. Восстановить будет нечем — резервной копии
            вашего аккаунта у нас не остаётся.
          </div>
          <div className="field">
            <label>Введите слово «удалить», чтобы подтвердить</label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoCapitalize="none"
              placeholder="удалить"
            />
          </div>
          <button
            className="btn danger block"
            disabled={confirmText.trim().toLowerCase() !== 'удалить' || busy}
            onClick={remove}
          >
            {busy ? 'Удаляю…' : 'Удалить навсегда'}
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
