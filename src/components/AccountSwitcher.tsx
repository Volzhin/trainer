import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createAccount } from '../db/coach'
import { Sheet } from './Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Переключатель аккаунтов — приём прототипа: без сервера иначе не показать,
 * как одна и та же связка выглядит со стороны тренера и со стороны клиента.
 * В проде вместо него обычная авторизация.
 */
export function AccountSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { userId, switchTo, toast } = useApp()
  const [creating, setCreating] = useState<'CLIENT' | 'TRAINER' | null>(null)
  const [name, setName] = useState('')
  const [spec, setSpec] = useState('')

  const accounts = useLiveQuery(() => db.profile.toArray(), [], [])

  const pick = async (id: string) => {
    if (id === userId) return onClose()
    haptics.selection()
    const target = await db.profile.get(id)
    await switchTo(id)
    onClose()
    nav(target?.role === 'TRAINER' ? '/trainer' : '/', { replace: true })
  }

  const create = async () => {
    if (!creating) return
    const id = await createAccount({
      name,
      role: creating,
      specialization: creating === 'TRAINER' ? spec : undefined,
    })
    setName('')
    setSpec('')
    setCreating(null)
    toast('Аккаунт создан')
    await pick(id)
  }

  return (
    <Sheet open={open} title={t('Аккаунты устройства')} onClose={onClose}>
      <div className="stack">
        {(accounts ?? []).map((a) => (
          <button
            key={a.id}
            className="list-item"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => pick(a.id)}
          >
            <div className="avatar">{a.name.slice(0, 1)}</div>
            <div className="grow">
              <div className="truncate">{a.name}</div>
              <div className="mute-sm">
                {a.role === 'TRAINER' ? 'Тренер' : 'Клиент'}
                {a.specialization ? ` · ${a.specialization}` : ''}
              </div>
            </div>
            {a.id === userId && <span className="badge pro">{t('активен')}</span>}
          </button>
        ))}

        {creating ? (
          <div className="card stack">
            <div className="field">
              <label>{t('Имя')}</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={creating === 'TRAINER' ? 'Мария' : 'Иван'}
                autoFocus
              />
            </div>
            {creating === 'TRAINER' && (
              <div className="field">
                <label>{t('Специализация')}</label>
                <input
                  className="input"
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  placeholder={t('Силовой тренинг, реабилитация')}
                />
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn grow" onClick={() => setCreating(null)}>
                {t('Отмена')}
              </button>
              <button className="btn primary grow" onClick={create}>
                {t('Создать')}
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => setCreating('CLIENT')}>
              {t('Новый клиент')}
            </button>
            <button className="btn grow" onClick={() => setCreating('TRAINER')}>
              {t('Новый тренер')}
            </button>
          </div>
        )}

        <div className="mute-sm" style={{ textAlign: 'center' }}>
          Все аккаунты живут в одной локальной базе — так связку тренер↔клиент видно без
          сервера.
        </div>
      </div>
    </Sheet>
  )
}
