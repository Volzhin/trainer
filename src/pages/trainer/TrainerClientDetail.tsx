import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, modeOf, type Program, type TrainerLink, type WorkoutSession } from '../../db/db'
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
  setLinkPayment,
} from '../../db/coach'
import { BarChart, LineChart } from '../../components/LineChart'
import { ContactLinks } from '../../components/ContactLinks'
import { BodyCompositionCard } from '../../components/BodyCompositionCard'
import { BodyCompositionView } from '../../components/BodyCompositionView'
import { Sheet } from '../../components/Sheet'
import { Group, Row } from '../../components/Group'
import { SessionReview } from '../../components/SessionReview'
import { ClientNutrition } from '../../components/ClientNutrition'
import { ClientReports } from '../../components/ClientReports'
import { pendingReviewCount, tasksOf } from '../../db/reports'
import { ChatThread } from '../../components/ChatThread'
import { ProgressView } from '../../components/ProgressView'
import { IconBack, IconCheck, IconPlus, IconTrash } from '../../components/Icons'
import { formatDate, formatDuration, plural, startOfDay, totalVolume } from '../../lib/calc'
import { useApp } from '../../store/app'

export function TrainerClientDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [tab, setTab] = useState<
    'overview' | 'chat' | 'reports' | 'progress' | 'body' | 'history' | 'nutrition' | 'notes'
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
          <h1 className="detail">{client.name}</h1>
          <div className="sub">
            {client.experience ?? 'опыт не указан'}
            {client.height_cm ? ` · ${client.height_cm} см` : ''}
          </div>
        </div>
      </div>

      {/* Порядок из пункта 5.1: профиль, прогресс, питание, тренировки, чат.
          Дальше — разделы, которых в спецификации нет, но которые тренеру
          нужны: разбор отчётов, состав тела и приватные заметки. Они стоят
          после названных, а не вперемешку с ними. */}
      <div className="chips">
        {(
          [
            ['overview', 'Профиль'],
            ['progress', 'Прогресс'],
            ['nutrition', 'Питание'],
            ['history', 'Тренировки'],
            ['chat', 'Чат'],
            ['reports', 'Отчёты'],
            ['body', 'Тело'],
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
          <div className="stat-grid mt-4">
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
            <div className="mute-sm mt-3">
              {modeOf(link) === 'online'
                ? 'Клиент сдаёт видео-отчёты, вы разбираете технику по записи.'
                : 'Видео-отчёт не запрашивается — технику вы видите на занятии.'}
            </div>
          </div>

          {/* Пункт 5.2: что выдано, но не сделано или не разобрано. Стоит
              выше оплаты и программы: это единственное на экране, что
              требует действия прямо сейчас. */}
          <div className="section-title">Требует внимания</div>
          <OutstandingCard clientId={id} onOpenReports={() => setTab('reports')} />

          <div className="section-title">Оплата</div>
          <PaymentCard link={link ?? null} onToast={toast} />

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
                    <div className="strong">{assignedProgram.name}</div>
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
                  <div className="muted mt-2">
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
                <div className="strong">Программа не назначена</div>
                <div className="muted mt-1">
                  Клиент не увидит план тренировок, пока вы не назначите программу.
                </div>
                <button
                  className="btn primary block mt-4"
                  onClick={() => setAssignOpen(true)}
                >
                  <IconPlus size={17} /> Назначить программу
                </button>
              </>
            )}
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

          <button className="btn ghost danger block mt-5" onClick={unlink}>
            Прекратить работу с клиентом
          </button>
          <div className="mute-sm" style={{ textAlign: 'center', marginTop: 8 }}>
            История тренировок останется у клиента, вы потеряете к ней доступ.
          </div>
        </>
      )}

      {tab === 'body' && (
        <div className="mt-1">
          <BodyCompositionView userId={id} subject="client" />
        </div>
      )}

      {tab === 'history' && (
        <div className="mt-4">
          {sessions.length === 0 && <div className="empty">Тренировок пока нет</div>}
          {sessions.map((s) => {
            const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
            return (
              <div className="card" key={s.id} style={{ marginBottom: 8 }}>
                <div className="row between">
                  <div className="grow">
                    <div className="truncate strong">
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
                  <div className="mute-sm mt-2">
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
        <div className="mt-4">
          <ProgressView userId={id} readOnly />
        </div>
      )}

      {tab === 'chat' && (
        <ChatThread
          trainerId={userId}
          clientId={id}
          meId={userId}
          meRole="TRAINER"
          emptyHint="Напишите клиенту — сообщение появится у него в разделе «Чат»."
        />
      )}

      {tab === 'reports' && <ClientReports clientId={id} />}

      {tab === 'nutrition' && <ClientNutrition clientId={id} />}

      {tab === 'notes' && (
        <div className="mt-4">
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
              <div className="mt-2">{n.text}</div>
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

/**
 * Что у клиента не закрыто: выданные и невыполненные задания плюс отчёты,
 * до которых у тренера не дошли руки.
 *
 * Считается здесь, а не берётся из общей сводки, потому что это две разные
 * очереди: задание ждёт клиента, отчёт ждёт тренера. Слитые в одно число,
 * они превращаются в «что-то не так» без ответа, кто следующий ходит.
 */
function OutstandingCard({
  clientId,
  onOpenReports,
}: {
  clientId: string
  onOpenReports: () => void
}) {
  const tasks = useLiveQuery(() => tasksOf(clientId), [clientId])
  const pending = useLiveQuery(() => pendingReviewCount(clientId), [clientId])

  if (tasks === undefined || pending === undefined) {
    return <div className="card skeleton" style={{ height: 84 }} />
  }

  const open = tasks.filter((t) => t.status === 'open')
  if (open.length === 0 && pending === 0) {
    return <div className="card mute-sm">Всё закрыто: заданий не висит, отчёты разобраны.</div>
  }

  return (
    <div className="card">
      {open.length > 0 && (
        <>
          <div className="strong">
            {open.length} {plural(open.length, ['задание', 'задания', 'заданий'])} не выполнено
          </div>
          <div className="mute-sm mt-1">
            {open
              .slice(0, 3)
              .map((t) => t.title)
              .join(' · ')}
            {open.length > 3 ? ` и ещё ${open.length - 3}` : ''}
          </div>
        </>
      )}

      {pending > 0 && (
        <div className={open.length > 0 ? 'mt-3' : undefined}>
          <div className="strong" style={{ color: 'var(--warn)' }}>
            {pending} {plural(pending, ['отчёт', 'отчёта', 'отчётов'])} ждёт разбора
          </div>
          <div className="mute-sm mt-1">Это ваш ход — клиент уже сдал.</div>
        </div>
      )}

      <button className="btn sm block mt-3" onClick={onOpenReports}>
        Открыть отчёты
      </button>
    </div>
  )
}

/** Дата в формате поля <input type="date">, в местном времени. */
const dateInputValue = (ts?: number) => {
  if (!ts) return ''
  const d = new Date(ts)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/** Полдень местного времени: дата оплаты — это день, а не момент. */
const parseDateInput = (value: string): number | undefined =>
  value ? new Date(`${value}T12:00:00`).getTime() : undefined

/**
 * Даты оплат. Приложение денег не принимает, поэтому обе даты — просто
 * отметки тренера, и обе необязательны: связь заводят и без разговора о
 * деньгах, а требовать дату ради заполненного поля незачем.
 */
function PaymentCard({
  link,
  onToast,
}: {
  link: TrainerLink | null
  onToast: (text: string) => void
}) {
  const [busy, setBusy] = useState(false)

  if (!link) return <div className="card mute-sm">Связь с клиентом не найдена.</div>

  const save = async (input: { paidAt?: number; nextPaymentAt?: number }) => {
    setBusy(true)
    try {
      await setLinkPayment(link.id, {
        paidAt: link.paid_at,
        nextPaymentAt: link.next_payment_at,
        ...input,
      })
      onToast('Даты оплаты сохранены')
    } finally {
      setBusy(false)
    }
  }

  // Просрочку считаем по началу дня: платёж «сегодня» ещё не опоздал.
  const due = link.next_payment_at
  const overdue = due != null && due < startOfDay(Date.now())

  return (
    <div className="card">
      <div className="row" style={{ gap: 8 }}>
        <div className="field grow">
          <label htmlFor="paid-at">Оплачено</label>
          <input
            id="paid-at"
            className="input"
            type="date"
            disabled={busy}
            value={dateInputValue(link.paid_at)}
            onChange={(e) => void save({ paidAt: parseDateInput(e.target.value) })}
          />
        </div>
        <div className="field grow">
          <label htmlFor="next-payment">Следующая оплата</label>
          <input
            id="next-payment"
            className="input"
            type="date"
            disabled={busy}
            value={dateInputValue(link.next_payment_at)}
            onChange={(e) => void save({ nextPaymentAt: parseDateInput(e.target.value) })}
          />
        </div>
      </div>
      <div className="mute-sm mt-2" style={{ color: overdue ? 'var(--danger)' : undefined }}>
        {due == null
          ? 'Дата следующей оплаты не задана — напоминание клиенту не придёт.'
          : overdue
            ? `Оплата просрочена с ${formatDate(due)}.`
            : `Клиенту напомним за 3 дня — ${formatDate(due - 3 * 86400_000)}.`}
      </div>
    </div>
  )
}

function SessionFeedback({ sessionId }: { sessionId: string }) {
  const rows = useLiveQuery(
    () => db.feedback.where('session_id').equals(sessionId).toArray(),
    [sessionId],
    [],
  )
  const withText = (rows ?? []).filter((f) => f.text.trim())
  if (!withText.length) return null
  return (
    <div className="mt-3">
      {withText.map((f) => (
        <div
          key={f.id}
          className="muted quote mt-2"
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
      <div className="segmented mb-4">
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
                    <span className="sub">
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
            <div className="mute-sm mt-2">
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
