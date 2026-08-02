import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useNavigate } from 'react-router-dom'
import { redeemInvite, removeLink, trainerOfClient } from '../db/coach'
import { unreadCount } from '../db/chat'
import { Sheet } from './Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/** Блок «Мой тренер» в профиле клиента: привязка по коду и отвязка. */
export function MyTrainerCard() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const linkVersion = useLiveQuery(() => db.links.count(), [])
  const bond = useLiveQuery(() => trainerOfClient(userId), [userId, linkVersion])
  const chatVersion = useLiveQuery(() => db.chat.count(), [])
  const unread = useLiveQuery(
    async () => (bond ? await unreadCount(bond.trainer.id, userId) : 0),
    [bond?.trainer.id, userId, chatVersion],
    0,
  )

  const submit = async () => {
    setBusy(true)
    try {
      const name = await redeemInvite(code, userId)
      haptics.success()
      toast(`Тренер ${name} подключён`)
      setCode('')
      setOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось подключить тренера')
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    if (!bond) return
    await removeLink(bond.link.id)
    toast('Тренер отключён')
  }

  return (
    <>
      <div className="section-title">Тренер</div>
      <div className="card">
        {bond ? (
          <>
            <div className="row">
              <div className="avatar">{bond.trainer.name.slice(0, 1)}</div>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{bond.trainer.name}</div>
                <div className="mute-sm">{bond.trainer.specialization ?? 'Персональный тренер'}</div>
              </div>
            </div>
            <button
              className="btn primary block"
              style={{ marginTop: 12 }}
              onClick={() => nav('/chat')}
            >
              Написать тренеру
              {unread > 0 && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  {unread}
                </span>
              )}
            </button>
            <div className="mute-sm" style={{ marginTop: 10 }}>
              Тренер видит вашу историю тренировок, прогресс и замеры тела. Личные настройки
              приложения и другие тренеры ему недоступны.
            </div>
            <button className="btn ghost danger block" style={{ marginTop: 12 }} onClick={unlink}>
              Отключить тренера
            </button>
          </>
        ) : (
          <>
            <div className="muted">
              Есть код от тренера? Введите его — тренер сможет назначать вам программы и
              комментировать тренировки.
            </div>
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
              Ввести код тренера
            </button>
          </>
        )}
      </div>

      <Sheet open={open} title="Код тренера" onClose={() => setOpen(false)}>
        <div className="stack">
          <div className="field">
            <label>Код приглашения</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoFocus
              style={{ letterSpacing: 4, fontWeight: 700, textAlign: 'center', fontSize: 22 }}
            />
          </div>
          <button className="btn primary block" disabled={busy || code.length < 6} onClick={submit}>
            {busy ? 'Проверяю…' : 'Подключить'}
          </button>
          <div className="mute-sm" style={{ textAlign: 'center' }}>
            Подключая тренера, вы открываете ему доступ к своей истории тренировок.
          </div>
        </div>
      </Sheet>
    </>
  )
}
