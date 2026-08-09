import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, modeOf, type Program, type WorkoutSession } from '../../db/db'
import {
  addTrainerNote,
  assignProgram,
  cancelAssignment,
  deleteTrainerNote,
  listTrainerNotes,
  createPersonalProgram,
  deletePersonalProgram,
  loadClientDetail,
  personalProgramsFor,
  removeLink,
  setLinkMode,
} from '../../db/coach'
import { BarChart, LineChart } from '../../components/LineChart'
import { ContactLinks } from '../../components/ContactLinks'
import { BodyCompositionCard } from '../../components/BodyCompositionCard'
import { BodyCompositionView } from '../../components/BodyCompositionView'
import { Sheet } from '../../components/Sheet'
import { Group, Row } from '../../components/Group'
import { SessionReview } from '../../components/SessionReview'
import { ClientNutrition } from '../../components/ClientNutrition'
import { ProgressView } from '../../components/ProgressView'
import { IconBack, IconCheck, IconPlus, IconTrash } from '../../components/Icons'
import { formatDate, formatDuration, plural, totalVolume } from '../../lib/calc'
import { useApp } from '../../store/app'

export function TrainerClientDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [tab, setTab] = useState<
    'overview' | 'progress' | 'body' | 'history' | 'nutrition' | 'notes'
  >('overview')
  // Из списка клиентов можно попасть сразу к назначению программы.
  const [params, setParams] = useSearchParams()
  const [assignOpen, setAssignOpen] = useState(params.get('assign') === '1')
  const [noteOpen, setNoteOpen] = useState(false)
  const [reviewing, setReviewing] = useState<WorkoutSession | null>(null)

  const version = useLiveQuery(
    async () => [
      await db.sessions.count(),
      await db.assignments.count(),
      await db.trainerNotes.count(),
      await db.feedback.count(),
    ],
    [id],
  )
  const detail = useLiveQuery(() => loadClientDetail(id), [id, version?.join('-')])
  const link = useLiveQuery(
    () => db.links.where('[trainer_id+client_id]').equals([userId, id]).first(),
    [userId, id],
  )
  const assignment = useLiveQuery(
    () =>
      db.assignments
        .where('client_id')
        .equals(id)
        .and((a) => a.trainer_id === userId && a.status === 'ACTIVE')
        .first(),
    [userId, id, version?.join('-')],
  )
  const assignedProgram = useLiveQuery(
    async () => (assignment ? await db.programs.get(assignment.program_id) : undefined),
    [assignment?.program_id],
  )
  const notes = useLiveQuery(
    () => listTrainerNotes(id, userId),
    [id, userId, version?.join('-')],
    [],
  )
  const personal = useLiveQuery(
    () => personalProgramsFor(id, userId),
    [id, userId, version?.join('-')],
    [] as Program[],
  )
  const allSets = useLiveQuery(() => db.sets.toArray(), [], [])

  if (!detail) return <div className="screen">Загрузка…</div>

  const { client, sessions, volumeByWeek, records, weightPoints } = detail
  const lastSession = sessions[0]

  const unlink = async () => {
    if (!link) return
    await removeLink(link.id)
    toast('Работа с клиентом завершена')
    nav('/trainer', { replace: true })
  }

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>{client.name}</h1>
          <div className="sub">
            {client.experience ?? 'опыт не указан'}
            {client.height_cm ? ` · ${client.height_cm} см` : ''}
          </div>
        </div>
      </div>

      <div className="chips">
        {(
          [
            ['overview', 'Сводка'],
            ['progress', 'Прогресс'],
            ['body', 'Тело'],
            ['nutrition', 'Питание'],
            ['history', 'Тренировки'],
            ['notes', 'Заметки'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`chip${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat">
              <div className="value">{sessions.length}</div>
              <div className="label">тренировок</div>
            </div>
            <div className="stat">
              <div className="value">
                {lastSession ? formatDate(lastSession.start_time) : '—'}
              </div>
              <div className="label">последняя</div>
            </div>
          </div>

          <div className="section-title">Режим работы</div>
          <div className="card">
            <div className="chips">
              {(
                [
                  ['online', 'Онлайн'],
                  ['offline', 'Очно'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={`chip${modeOf(link) === value ? ' active' : ''}`}
                  disabled={!link}
                  onClick={async () => {
                    if (!link || modeOf(link) === value) return
                    await setLinkMode(link.id, value)
                    toast(value === 'online' ? 'Режим: онлайн' : 'Режим: очно')
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mute-sm" style={{ marginTop: 10 }}>
              {modeOf(link) === 'online'
                ? 'Клиент сдаёт видео-отчёты, вы разбираете технику по записи.'
                : 'Видео-отчёт не запрашивается — технику вы видите на занятии.'}
            </div>
          </div>

          <div className="section-title">Связь с клиентом</div>
          <div className="card">
            <ContactLinks
              profile={client}
              title="Написать"
              emptyHint="Клиент не указал, где с ним связаться. Попросите заполнить это в профиле."
            />
          </div>

          <div className="section-title">Тело</div>
          <BodyCompositionCard userId={id} subject="client" onOpen={() => setTab('body')} />

          <div className="section-title">Программа от вас</div>
          <div className="card">
            {assignment && assignedProgram ? (
              <>
                <div className="row between">
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{assignedProgram.name}</div>
                    <div className="mute-sm">
                      {assignment.schedule?.length
                        ? assignment.schedule
                            .slice()
                            .sort((a, b) => a.weekday - b.weekday)
                            .map((sl) => WEEKDAYS[sl.weekday])
                            .join(', ')
                        : `${assignment.weekly_target} в неделю`}
                      {assignment.end_at
                        ? ` · до ${formatDate(assignment.end_at - 86400_000)}`
                        : ` · с ${formatDate(assignment.start_at)}`}
                    </div>
                  </div>
                </div>
                {assignment.note && (
                  <div className="muted" style={{ marginTop: 8 }}>
                    {assignment.note}
                  </div>
                )}
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <button className="btn sm grow" onClick={() => setAssignOpen(true)}>
                    Заменить программу
                  </button>
                  <button
                    className="btn sm ghost danger"
                    onClick={async () => {
                      await cancelAssignment(assignment.id)
                      toast('Программа снята с клиента')
                    }}
                  >
                    Снять
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>Программа не назначена</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Клиент не увидит план тренировок, пока вы не назначите программу.
                </div>
                <button
                  className="btn primary block"
                  style={{ marginTop: 14 }}
                  onClick={() => setAssignOpen(true)}
                >
                  <IconPlus size={17} /> Назначить программу
                </button>
              </>
            )}
          </div>

          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat">
              <div className="value">{sessions.length}</div>
              <div className="label">тренировок</div>
            </div>
            <div className="stat">
              <div className="value">
                {lastSession ? formatDate(lastSession.start_time) : '—'}
              </div>
              <div className="label">последняя</div>
            </div>
          </div>

          {(personal ?? []).length > 0 && (
            <Group title="Персональные программы">
              {(personal ?? []).map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  sub={p.id === assignment?.program_id ? 'назначена сейчас' : 'не назначена'}
                  onClick={() => nav(`/programs/${p.id}`)}
                >
                  <button
                    className="icon-btn"
                    aria-label="Удалить программу"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await deletePersonalProgram(p.id)
                      toast('Программа удалена')
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                </Row>
              ))}
            </Group>
          )}

          <div className="section-title">Тоннаж по неделям</div>
          <div className="card">
            <BarChart
              data={volumeByWeek.map((v) => v.value)}
              labels={volumeByWeek.map((v) => v.label)}
            />
          </div>

          <div className="section-title">Рекорды · расчётный 1ПМ</div>
          {records.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              Данных пока нет
            </div>
          ) : (
            records.map((r) => (
              <div className="list-item" key={r.name}>
                <div className="grow truncate">{r.name}</div>
                <strong>{Math.round(r.score)} кг</strong>
              </div>
            ))
          )}

          <div className="section-title">Вес</div>
          <div className="card">
            <LineChart data={weightPoints} unit=" кг" color="var(--ok)" />
          </div>

          <button className="btn ghost danger block" style={{ marginTop: 20 }} onClick={unlink}>
            Прекратить работу с клиентом
          </button>
          <div className="mute-sm" style={{ textAlign: 'center', marginTop: 8 }}>
            История тренировок останется у клиента, вы потеряете к ней доступ.
          </div>
        </>
      )}

      {tab === 'body' && (
        <div style={{ marginTop: 4 }}>
          <BodyCompositionView userId={id} subject="client" />
        </div>
      )}

      {tab === 'history' && (
        <div style={{ marginTop: 14 }}>
          {sessions.length === 0 && <div className="empty">Тренировок пока нет</div>}
          {sessions.map((s) => {
            const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
            return (
              <div className="card" key={s.id} style={{ marginBottom: 8 }}>
                <div className="row between">
                  <div className="grow">
                    <div className="truncate" style={{ fontWeight: 600 }}>
                      {s.title}
                    </div>
                    <div className="mute-sm">
                      {formatDate(s.start_time)} · {sets.length}{' '}
                      {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                      {Math.round(totalVolume(sets))} кг ·{' '}
                      {formatDuration((s.end_time ?? s.start_time) - s.start_time)}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => setReviewing(s)}>
                    Разобрать
                  </button>
                </div>
                {s.notes && (
                  <div className="mute-sm" style={{ marginTop: 8 }}>
                    Заметка клиента: {s.notes}
                  </div>
                )}
                <SessionFeedback sessionId={s.id} />
              </div>
            )
          })}
        </div>
      )}

      {/* Тот же разбор, что видит клиент: тренер должен смотреть на те же
          цифры, иначе они спорят о разных отчётах. */}
      {tab === 'progress' && (
        <div style={{ marginTop: 14 }}>
          <ProgressView userId={id} readOnly />
        </div>
      )}

      {tab === 'nutrition' && <ClientNutrition clientId={id} />}

      {tab === 'notes' && (
        <div style={{ marginTop: 14 }}>
          <button className="btn block" onClick={() => setNoteOpen(true)}>
            <IconPlus size={16} /> Добавить заметку
          </button>
          <div className="mute-sm" style={{ textAlign: 'center', margin: '8px 0 14px' }}>
            Заметки видны только вам.
          </div>
          {(notes ?? []).length === 0 && <div className="empty">Заметок пока нет</div>}
          {(notes ?? []).map((n) => (
            <div className="card" key={n.id} style={{ marginBottom: 8 }}>
              <div className="row between">
                <div className="mute-sm">{formatDate(n.created_at)}</div>
                <button
                  className="icon-btn"
                  onClick={() => deleteTrainerNote(n.id)}
                  aria-label="Удалить"
                >
                  <IconTrash size={15} />
                </button>
              </div>
              <div style={{ marginTop: 6 }}>{n.text}</div>
            </div>
          ))}
        </div>
      )}

      <AssignSheet
        open={assignOpen}
        clientId={id}
        clientName={client.name}
        onClose={() => {
          setAssignOpen(false)
          if (params.get('assign')) setParams({}, { replace: true })
        }}
        onDone={() => toast('Программа назначена')}
      />

      <TextSheet
        open={noteOpen}
        title="Заметка о клиенте"
        placeholder="Травмы, ограничения, договорённости"
        onClose={() => setNoteOpen(false)}
        onSubmit={async (text) => {
          await addTrainerNote(id, text, userId)
          toast('Заметка сохранена')
        }}
      />

      <SessionReview session={reviewing} clientId={id} onClose={() => setReviewing(null)} />
    </div>
  )
}

function SessionFeedback({ sessionId }: { sessionId: string }) {
  const rows = useLiveQuery(
    () => db.feedback.where('session_id').equals(sessionId).toArray(),
    [sessionId],
    [],
  )
  if (!rows?.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      {rows.map((f) => (
        <div
          key={f.id}
          className="mute-sm"
          style={{
            borderLeft: '2px solid var(--accent)',
            paddingLeft: 10,
            marginTop: 6,
            color: 'var(--text-2)',
          }}
        >
          {f.text}
          {f.is_read === 0 && (
            <span className="badge" style={{ marginLeft: 8 }}>
              не прочитано
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

function AssignSheet({
  open,
  clientId,
  clientName,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  clientName: string
  onClose: () => void
  onDone: () => void
}) {
  const nav = useNavigate()
  const { userId, toast } = useApp()
  const [mode, setMode] = useState<'ready' | 'new'>('ready')
  const [programId, setProgramId] = useState('')
  const [weeks, setWeeks] = useState(8)
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  /** Какой день программы стоит на каком дне недели. */
  const [slots, setSlots] = useState<Record<number, string>>({})

  const programs = useLiveQuery(
    () =>
      db.programs.filter((p) => p.author_id === userId || p.author_id === 'system').toArray(),
    [userId],
    [] as Program[],
  )
  const allRoutines = useLiveQuery(() => db.routines.toArray(), [], [])

  const chosen = programId || programs?.[0]?.id || ''
  const days = useMemo(
    () =>
      (allRoutines ?? [])
        .filter((r) => r.program_id === chosen)
        .sort((a, b) => a.day_order - b.day_order),
    [allRoutines, chosen],
  )

  // При смене программы расписание раскладываем по умолчанию: пн / ср / пт
  // и далее — самый частый разнос тренировок через день.
  useEffect(() => {
    if (!days.length) return setSlots({})
    const preset = [0, 2, 4, 1, 3, 5, 6]
    const next: Record<number, string> = {}
    days.forEach((r, i) => {
      const wd = preset[i % preset.length]
      next[wd] = r.id
    })
    setSlots(next)
  }, [chosen, days.length])

  const schedule = Object.entries(slots)
    .filter(([, routineId]) => routineId)
    .map(([weekday, routineId]) => ({ weekday: Number(weekday), routine_id: routineId }))

  /** Клик по дню недели перебирает дни программы и «пусто». */
  const cycleDay = (weekday: number) => {
    setSlots((prev) => {
      const current = prev[weekday]
      const idx = days.findIndex((d) => d.id === current)
      const next = { ...prev }
      if (idx === -1) next[weekday] = days[0]?.id
      else if (idx === days.length - 1) delete next[weekday]
      else next[weekday] = days[idx + 1].id
      return next
    })
  }

  const shortName = (routineId?: string) => {
    const r = days.find((d) => d.id === routineId)
    if (!r) return null
    const i = days.indexOf(r)
    return String.fromCharCode(65 + i)
  }

  const assignReady = async () => {
    if (!chosen || !schedule.length) return
    setBusy(true)
    try {
      await assignProgram({
        clientId,
        programId: chosen,
        schedule,
        weeks,
        note,
        trainerId: userId,
      })
      setNote('')
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const createAndOpen = async () => {
    setBusy(true)
    try {
      const id = await createPersonalProgram({
        clientId,
        name: newName,
        weeklyTarget: 3,
        trainerId: userId,
      })
      toast('Программа создана — добавьте упражнения')
      onClose()
      nav(`/programs/${id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={`Программа для ${clientName}`} onClose={onClose}>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'ready' ? 'on' : ''} onClick={() => setMode('ready')}>
          Готовая
        </button>
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
          Своя с нуля
        </button>
      </div>

      {mode === 'ready' ? (
        <div className="stack">
          <div className="group">
            {(programs ?? []).map((p) => {
              const count = (allRoutines ?? []).filter((r) => r.program_id === p.id).length
              return (
                <button
                  key={p.id}
                  className="group-row"
                  onClick={() => setProgramId(p.id)}
                  style={p.id === chosen ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {p.goal} · {count} {plural(count, ['день', 'дня', 'дней'])}
                      {p.author_id === userId ? ' · моя' : ''}
                    </span>
                  </span>
                  {p.id === chosen && (
                    <span className="chevron" style={{ color: 'var(--accent-ink)' }}>
                      <IconCheck size={17} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="field">
            <label>Дни недели</label>
            {/* Нажатие перебирает дни программы: так расписание собирается
                одним пальцем, без выпадающих списков на каждый день. */}
            <div className="weekday-row">
              {WEEKDAYS.map((label, wd) => {
                const mark = shortName(slots[wd])
                return (
                  <button
                    key={wd}
                    className={`weekday${mark ? ' on' : ''}`}
                    onClick={() => cycleDay(wd)}
                  >
                    <span className="wd">{label}</span>
                    <span className="slot">{mark ?? '—'}</span>
                  </button>
                )
              })}
            </div>
            <div className="mute-sm" style={{ marginTop: 8 }}>
              {schedule.length
                ? `${schedule.length} ${plural(schedule.length, ['тренировка', 'тренировки', 'тренировок'])} в неделю`
                : 'Выберите хотя бы один день'}
            </div>
          </div>

          {days.length > 0 && (
            <div className="group">
              {days.map((r, i) => (
                <div className="group-row" key={r.id}>
                  <span className="metric-icon" style={{ color: 'var(--accent-ink)' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="grow title">{r.name}</span>
                  <span className="value">
                    {WEEKDAYS.filter((_, wd) => slots[wd] === r.id).join(', ') || 'не назначен'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <label>Сколько недель</label>
            <div className="segmented">
              {[4, 6, 8, 12].map((v) => (
                <button key={v} className={weeks === v ? 'on' : ''} onClick={() => setWeeks(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Комментарий клиенту</label>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: первые две недели работаем в лёгком темпе"
            />
          </div>

          <button
            className="btn primary block"
            disabled={busy || !chosen || !schedule.length}
            onClick={assignReady}
          >
            Назначить на {weeks} {plural(weeks, ['неделю', 'недели', 'недель'])}
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="muted">
            Создадим пустую программу под этого клиента. Наполните её днями и упражнениями,
            потом назначьте на дни недели.
          </div>
          <div className="field">
            <label>Название</label>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Программа · ${clientName}`}
            />
          </div>
          <button className="btn primary block" disabled={busy} onClick={createAndOpen}>
            Создать и наполнить
          </button>
        </div>
      )}
    </Sheet>
  )
}

function TextSheet({
  open,
  title,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  placeholder: string
  onClose: () => void
  onSubmit: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')

  const submit = async () => {
    if (!text.trim()) return
    await onSubmit(text)
    setText('')
    onClose()
  }

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="stack">
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
        <button className="btn primary block" disabled={!text.trim()} onClick={submit}>
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}
