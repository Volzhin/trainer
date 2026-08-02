import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, type Program } from '../db/db'
import {
  FREE_PROGRAM_LIMIT,
  canCreateProgram,
  createProgram,
  createRoutine,
  deleteProgram,
  startSessionFromRoutine,
  getActiveSession,
} from '../db/repo'
import { IconClipboard, IconPlay, IconPlus, IconTrash } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { useApp, useProfile } from '../store/app'
import { haptics } from '../lib/native'
import { plural } from '../lib/calc'

const GOALS = ['Все', 'Гипертрофия', 'Сила', 'Дом', 'Похудение', 'Кроссфит']

export function Programs() {
  const nav = useNavigate()
  const { toast } = useApp()
  const profile = useProfile()
  const [goal, setGoal] = useState('Все')
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')

  const programs = useLiveQuery(() => db.programs.toArray(), [], [] as Program[])
  const routines = useLiveQuery(() => db.routines.toArray(), [], [])
  const active = useLiveQuery(() => getActiveSession(), [])

  const visible = useMemo(() => {
    return (programs ?? [])
      .filter((p) => (tab === 'mine' ? p.author_id === currentUserId() : p.author_id === 'system'))
      .filter((p) => (goal === 'Все' ? true : p.goal === goal))
  }, [programs, goal, tab])

  const myCount = (programs ?? []).filter((p) => p.author_id === currentUserId()).length

  const onCreate = async () => {
    if (!(await canCreateProgram())) {
      toast(`Бесплатный тариф: до ${FREE_PROGRAM_LIMIT} своих программ`)
      return
    }
    const id = await createProgram(name.trim() || 'Моя программа')
    await createRoutine(id, 'День 1')
    setName('')
    setCreateOpen(false)
    setTab('mine')
    nav(`/programs/${id}`)
  }

  return (
    <div className={`screen${active ? ' with-banner' : ''}`}>
      <div className="header">
        <div>
          <h1>Программы</h1>
          <div className="sub">Готовые сплиты и свои шаблоны</div>
        </div>
        <button className="icon-btn" onClick={() => setCreateOpen(true)} aria-label="Создать программу">
          <IconPlus size={18} />
        </button>
      </div>

      <div className="chips">
        <button
          className={`chip${tab === 'catalog' ? ' active' : ''}`}
          onClick={() => setTab('catalog')}
        >
          Каталог
        </button>
        <button className={`chip${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
          Мои ({myCount})
        </button>
      </div>

      {tab === 'catalog' && (
        <div className="chips" style={{ marginTop: 6 }}>
          {GOALS.map((g) => (
            <button key={g} className={`chip${goal === g ? ' active' : ''}`} onClick={() => setGoal(g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }} className="stack">
        {visible.length === 0 && (
          <div className="empty">
            <div className="big">
              <IconClipboard size={34} />
            </div>
            {tab === 'mine' ? 'Создайте свою первую программу' : 'В этой категории пусто'}
          </div>
        )}

        {visible.map((p) => {
          const days = (routines ?? []).filter((r) => r.program_id === p.id)
          return (
            <div className="card tap" key={p.id} onClick={() => nav(`/programs/${p.id}`)}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{p.name}</div>
                  <div className="mute-sm" style={{ marginTop: 3 }}>
                    {p.goal} · {p.level} · {days.length}{' '}
                    {plural(days.length, ['день', 'дня', 'дней'])}
                  </div>
                </div>
                {p.author_id === currentUserId() && (
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteProgram(p.id)
                      toast('Программа удалена')
                    }}
                    aria-label="Удалить"
                  >
                    <IconTrash size={17} />
                  </button>
                )}
              </div>
              {p.description && (
                <div className="muted" style={{ marginTop: 8 }}>
                  {p.description}
                </div>
              )}
              {days.length > 0 && (
                <div className="stack" style={{ marginTop: 12 }}>
                  {days
                    .sort((a, b) => a.day_order - b.day_order)
                    .map((d) => (
                      <div className="row between" key={d.id}>
                        <span className="truncate">{d.name}</span>
                        <button
                          className="btn sm"
                          onClick={async (e) => {
                            e.stopPropagation()
                            haptics.impact()
                            const sid = await startSessionFromRoutine(d.id)
                            nav(`/session/${sid}`)
                          }}
                        >
                          <IconPlay size={13} /> Начать
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {profile?.plan === 'FREE' && tab === 'mine' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>
                PRO <span className="badge pro">безлимит</span>
              </div>
              <div className="mute-sm" style={{ marginTop: 3 }}>
                Бесплатно доступно {FREE_PROGRAM_LIMIT} своих программы. В PRO — без ограничений,
                расширенная аналитика и графики 1ПМ.
              </div>
            </div>
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => nav('/profile')}>
            Подробнее о PRO
          </button>
        </div>
      )}

      <Sheet open={createOpen} title="Новая программа" onClose={() => setCreateOpen(false)}>
        <div className="stack">
          <div className="field">
            <label>Название</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Верх / Низ"
              autoFocus
            />
          </div>
          <button className="btn primary block" onClick={onCreate}>
            Создать
          </button>
        </div>
      </Sheet>
    </div>
  )
}
