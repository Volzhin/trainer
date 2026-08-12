import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, type Program } from '../db/db'
import {
  createProgram,
  createRoutine,
  deleteProgram,
  startSessionFromRoutine,
  getActiveSession,
  toggleFavoriteProgram,
} from '../db/repo'
import { IconClipboard, IconPlay, IconPlus, IconStar, IconTrash } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { activeAssignmentFor } from '../db/coach'
import { useApp, useProfile } from '../store/app'
import { haptics } from '../lib/native'
import { plural } from '../lib/calc'
import { t } from '../lib/i18n'

const GOALS = ['Все', 'Гипертрофия', 'Сила', 'Дом', 'Похудение', 'Кроссфит']

export function Programs() {
  const nav = useNavigate()
  const { toast } = useApp()
  const profile = useProfile()
  const [goal, setGoal] = useState('Все')
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')

  const programs = useLiveQuery(() => db.programs.toArray(), [])
  const loading = programs === undefined
  const routines = useLiveQuery(() => db.routines.toArray(), [], [])
  // Персональные программы подписываем именем клиента: без этого список
  // тренера превращается в набор одинаковых «Программа · …».
  const clientNames = useLiveQuery(
    async () => {
      const rows = await db.profile.toArray()
      return new Map(rows.map((r) => [r.id, r.name]))
    },
    [],
    new Map<string, string>(),
  )
  const active = useLiveQuery(() => getActiveSession(), [])
  // Когда тренер назначил программу, клиент должен видеть только её:
  // каталог рядом с назначением читается как «можно выбрать другое».
  const plan = useLiveQuery(() => activeAssignmentFor(currentUserId()), [])
  // Свой план так не прячет ничего: человек поставил его сам и вправе в любой
  // момент выбрать другое. Скрывать от него каталог значило бы запирать его в
  // собственном же решении.
  const assigned = plan && !plan.isSelfPlan ? plan : null

  /**
   * «Мои» — это не только собранные своими руками. Программа, которую тренер
   * сделал под этого человека, и отмеченная звёздочкой из каталога для него
   * ровно такие же свои: он к ним возвращается, а не выбирает их заново.
   */
  const favorites = useMemo(
    () => new Set(profile?.favorite_programs ?? []),
    [profile?.favorite_programs],
  )
  const isMine = (p: Program) =>
    p.author_id === currentUserId() || p.client_id === currentUserId() || favorites.has(p.id)

  const visible = useMemo(() => {
    if (assigned) return (programs ?? []).filter((p) => p.id === assigned.program.id)
    return (programs ?? [])
      .filter((p) => (tab === 'mine' ? isMine(p) : p.author_id === 'system'))
      .filter((p) => (tab === 'mine' ? true : goal === 'Все' || p.goal === goal))
  }, [programs, goal, tab, favorites, assigned?.program.id])

  const myCount = (programs ?? []).filter(isMine).length

  const onCreate = async () => {
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
          <h1>{assigned ? t('Моя программа') : t('Программы')}</h1>
          <div className="sub">
            {assigned
              ? `От тренера${assigned.trainer ? ` · ${assigned.trainer.name}` : ''}`
              : t('Готовые сплиты и свои шаблоны')}
          </div>
        </div>
        {!assigned && (
          <button
            className="icon-btn"
            onClick={() => setCreateOpen(true)}
            aria-label={t('Создать программу')}
          >
            <IconPlus size={18} />
          </button>
        )}
      </div>

      {!assigned && (
        <div className="chips">
          <button
            className={`chip${tab === 'catalog' ? ' active' : ''}`}
            onClick={() => setTab('catalog')}
          >
            {t('Каталог')}
          </button>
          <button
            className={`chip${tab === 'mine' ? ' active' : ''}`}
            onClick={() => setTab('mine')}
          >
            {t('Мои программы')} ({myCount})
          </button>
        </div>
      )}

      {!assigned && tab === 'catalog' && (
        <div className="chips mt-2">
          {GOALS.map((g) => (
            <button
              key={g}
              className={`chip${goal === g ? ' active' : ''}`}
              onClick={() => setGoal(g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="stack mt-4">
        {loading ? (
          <div className="stack">
            <div className="card skeleton" style={{ height: 76 }} />
            <div className="card skeleton" style={{ height: 76 }} />
          </div>
        ) : (
          visible.length === 0 && (
            <div className="empty">
              <div className="big">
                <IconClipboard size={34} />
              </div>
              {assigned
                ? t('Программа от тренера скоро появится')
                : tab === 'mine'
                  ? t(
                      'Здесь появятся программы от тренера и отмеченные звёздочкой в каталоге. Свою можно собрать кнопкой «+».',
                    )
                  : t('В этой категории пусто')}
            </div>
          )
        )}

        {visible.map((p) => {
          const days = (routines ?? []).filter((r) => r.program_id === p.id)
          const mineByAuthor = p.author_id === currentUserId()
          const fromTrainer = p.client_id === currentUserId() && !mineByAuthor
          const starred = favorites.has(p.id)
          return (
            <div className="card tap" key={p.id} onClick={() => nav(`/programs/${p.id}`)}>
              <div className="row between">
                <div className="grow">
                  <div className="strong" style={{ fontSize: 17 }}>{p.name}</div>
                  <div className="mute-sm" style={{ marginTop: 3 }}>
                    {fromTrainer
                      ? 'От тренера · '
                      : p.client_id
                        ? `для ${clientNames.get(p.client_id) ?? 'клиента'} · `
                        : `${p.goal} · ${p.level} · `}
                    {days.length} {plural(days.length, ['день', 'дня', 'дней'])}
                  </div>
                </div>
                {/* Своё удаляют, чужое отмечают: каталог принадлежит всем,
                    и удалить из него программу человек не может — только
                    убрать её из своего списка. */}
                {mineByAuthor ? (
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteProgram(p.id)
                      toast(t('Программа удалена'))
                    }}
                    aria-label={t('Удалить')}
                  >
                    <IconTrash size={17} />
                  </button>
                ) : (
                  !fromTrainer && (
                    <button
                      className="icon-btn"
                      onClick={async (e) => {
                        e.stopPropagation()
                        haptics.selection()
                        const added = await toggleFavoriteProgram(p.id)
                        toast(added ? 'Добавлено в мои программы' : 'Убрано из моих программ')
                      }}
                      aria-label={starred ? 'Убрать из моих' : 'Добавить в мои'}
                      aria-pressed={starred}
                    >
                      <IconStar size={17} filled={starred} />
                    </button>
                  )
                )}
              </div>
              {p.description && (
                <div className="muted mt-2">
                  {p.description}
                </div>
              )}
              {days.length > 0 && (
                <div className="stack mt-3">
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
                            if (!sid) {
                              toast('В этом дне пока нет упражнений')
                              return
                            }
                            nav(`/session/${sid}`)
                          }}
                        >
                          <IconPlay size={13} /> {t('Начать')}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>


      <Sheet open={createOpen} title={t('Новая программа')} onClose={() => setCreateOpen(false)}>
        <div className="stack">
          <div className="field">
            <label>{t('Название')}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Верх / Низ"
              autoFocus
            />
          </div>
          <button className="btn primary block" onClick={onCreate}>
            {t('Создать')}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
