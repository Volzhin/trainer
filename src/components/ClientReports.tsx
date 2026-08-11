import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NutritionDay, type WorkoutReport } from '../db/db'
import {
  activityRange,
  addTask,
  currentTargets,
  reviewReport,
  reviewedRefs,
  setWeeklyTargets,
  submittedNutritionDays,
  tasksOf,
  workoutReportsOf,
} from '../db/reports'
import { formatDate, plural } from '../lib/calc'
import { localDate } from '../lib/tdee'
import { Sheet } from './Sheet'
import { SATIETY_LABELS } from './NutritionDayReport'
import { Group, Row } from './Group'
import { IconCheck, IconPlus } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/** Глубина ленты отчётов: дальше двух недель разбирать уже поздно. */
const WINDOW_DAYS = 14

/**
 * Отчётность клиента глазами тренера: что сдано и ещё не разобрано, какие
 * задания висят, какие цели выданы на неделю и сколько человек ходит и спит.
 *
 * Отметка о проверке остаётся здесь и к клиенту не уезжает — он видит у
 * своего отчёта только «сдан». А вот ответ тренера адресован именно ему,
 * поэтому пишется на сам отчёт и приезжает к нему вместе с ним.
 */
export function ClientReports({ clientId }: { clientId: string }) {
  const { toast, userId } = useApp()

  const today = localDate()
  const from = localDate(Date.now() - (WINDOW_DAYS - 1) * 86400_000)

  const reports = useLiveQuery(() => workoutReportsOf(clientId), [clientId])
  const days = useLiveQuery(() => submittedNutritionDays(clientId), [clientId])
  const seenWorkouts = useLiveQuery(() => reviewedRefs(clientId, 'workout'), [clientId])
  const seenDays = useLiveQuery(() => reviewedRefs(clientId, 'nutrition'), [clientId])
  const sessions = useLiveQuery(
    () => db.sessions.where('user_id').equals(clientId).toArray(),
    [clientId],
  )
  const tasks = useLiveQuery(() => tasksOf(clientId), [clientId])
  const targets = useLiveQuery(() => currentTargets(clientId), [clientId])
  const activity = useLiveQuery(
    () => activityRange(clientId, from, today),
    [clientId, from, today],
  )

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [targetsOpen, setTargetsOpen] = useState(false)

  const titleOf = useMemo(() => new Map((sessions ?? []).map((s) => [s.id, s])), [sessions])

  const loading =
    reports === undefined ||
    days === undefined ||
    seenWorkouts === undefined ||
    seenDays === undefined ||
    tasks === undefined

  if (loading) return <div className="empty">Загрузка…</div>

  const submittedWorkouts = reports.filter((r) => r.status === 'submitted')

  const queue: ReviewSubject[] = [
    ...submittedWorkouts.map((r) => toWorkoutSubject(r, titleOf.get(r.session_id)?.title)),
    ...days.map(toDaySubject),
  ].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))

  const isReviewed = (s: ReviewSubject) =>
    s.target === 'workout' ? seenWorkouts.has(s.ref) : seenDays.has(s.ref)

  const pending = queue.filter((s) => !isReviewed(s))
  const openTasks = tasks.filter((t) => t.status === 'open')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  return (
    <div style={{ marginTop: 14 }}>
      <div className="stat-grid">
        <div className="stat">
          <div className="value" style={{ color: pending.length ? 'var(--warn)' : undefined }}>
            {pending.length}
          </div>
          <div className="label">ждут разбора</div>
        </div>
        <div className="stat">
          <div className="value">{openTasks.length}</div>
          <div className="label">заданий не выполнено</div>
        </div>
      </div>

      <div className="section-title">Сданные отчёты</div>
      {queue.length === 0 ? (
        <div className="empty compact">Клиент пока ничего не сдавал.</div>
      ) : (
        <div>
          {queue.map((s) => (
            <button
              key={`${s.target}:${s.ref}`}
              className="list-item"
              onClick={() => setReviewing(s)}
            >
              <div className="grow">
                <div className="truncate strong">
                  {s.title}
                </div>
                <div className="mute-sm truncate">
                  {s.subtitle}
                  {s.comment ? ` · ${s.comment}` : ''}
                </div>
              </div>
              {isReviewed(s) ? (
                <span className="badge">
                  <IconCheck size={11} />
                  разобран
                </span>
              ) : (
                <span className="badge pro">новый</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="section-title">Цели на неделю</div>
      <div className="card">
        {targets ? (
          <>
            <div className="mute-sm figures">
              {[
                targets.kcal && `${targets.kcal} ккал`,
                targets.protein && `Б ${targets.protein}`,
                targets.fat && `Ж ${targets.fat}`,
                targets.carbs && `У ${targets.carbs}`,
                targets.steps && `${targets.steps} шагов`,
              ]
                .filter(Boolean)
                .join(' · ') || 'без цифр'}
            </div>
            {targets.note && (
              <div
                className="mute-sm"
                style={{
                  marginTop: 10,
                  paddingLeft: 10,
                  borderLeft: '2px solid var(--accent)',
                }}
              >
                {targets.note}
              </div>
            )}
            <button
              className="btn sm block"
              style={{ marginTop: 12 }}
              onClick={() => setTargetsOpen(true)}
            >
              Обновить цели
            </button>
          </>
        ) : (
          <>
            <div className="muted">Цели на эту неделю не выданы.</div>
            <button
              className="btn primary block"
              style={{ marginTop: 14 }}
              onClick={() => setTargetsOpen(true)}
            >
              Выдать цели
            </button>
          </>
        )}
      </div>

      <div className="section-title">Шаги и сон за {WINDOW_DAYS} дней</div>
      <ActivityList rows={activity ?? []} />

      <div className="section-title">Задания</div>
      {openTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="empty compact">Заданий нет.</div>
      ) : (
        <Group>
          {[...openTasks, ...doneTasks].map((t) => (
            <Row
              key={t.id}
              title={t.title}
              sub={
                t.status === 'done'
                  ? t.answer
                    ? `Выполнено · ${t.answer}`
                    : 'Выполнено'
                  : t.required === 1
                    ? 'Обязательное · не выполнено'
                    : 'Не выполнено'
              }
              value={t.status === 'done' ? <IconCheck size={16} /> : undefined}
            />
          ))}
        </Group>
      )}
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setTaskOpen(true)}>
        <IconPlus size={16} /> Выдать задание
      </button>

      <ReviewSheet
        subject={reviewing}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setReviewing(null)}
        onDone={() => toast('Отчёт разобран')}
      />
      <TaskSheet
        open={taskOpen}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setTaskOpen(false)}
        onDone={() => toast('Задание выдано')}
      />
      <TargetsSheet
        open={targetsOpen}
        clientId={clientId}
        trainerId={userId}
        current={targets ?? undefined}
        onClose={() => setTargetsOpen(false)}
        onDone={() => toast('Цели на неделю выданы')}
      />
    </div>
  )
}

/* ------------------------- отчёт как предмет разбора ------------------- */

type ReviewSubject = {
  target: 'workout' | 'nutrition'
  /** id отчёта о тренировке либо дата дня питания. */
  ref: string
  title: string
  subtitle: string
  /** Что написал клиент, сдавая отчёт. */
  comment?: string
  /** Что тренер уже отвечал — ответ можно поправить. */
  reply?: string
  submittedAt?: number
}

const toWorkoutSubject = (r: WorkoutReport, title?: string): ReviewSubject => ({
  target: 'workout',
  ref: r.id,
  title: title ?? 'Тренировка',
  subtitle: r.submitted_at ? `Сдана ${formatDate(r.submitted_at)}` : 'Сдана',
  comment: r.client_comment,
  reply: r.trainer_comment,
  submittedAt: r.submitted_at,
})

const toDaySubject = (d: NutritionDay): ReviewSubject => ({
  target: 'nutrition',
  ref: d.date,
  title: `Питание · ${formatDate(new Date(`${d.date}T12:00:00`).getTime())}`,
  subtitle: d.satiety ? `Сытость: ${SATIETY_LABELS[d.satiety]}` : 'День питания',
  comment: d.comment,
  reply: d.trainer_comment,
  submittedAt: d.submitted_at,
})

function ReviewSheet({
  subject,
  clientId,
  trainerId,
  onClose,
  onDone,
}: {
  subject: ReviewSubject | null
  clientId: string
  trainerId: string
  onClose: () => void
  onDone: () => void
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setReply(subject?.reply ?? ''), [subject?.target, subject?.ref])

  if (!subject) return null

  const send = async () => {
    setBusy(true)
    try {
      await reviewReport({
        clientId,
        trainerId,
        target: subject.target,
        ref: subject.ref,
        comment: reply,
      })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!subject} title={subject.title} onClose={onClose}>
      <div className="mute-sm">{subject.subtitle}</div>

      {subject.comment && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="mute-sm">Что написал клиент</div>
          <div style={{ marginTop: 4 }}>{subject.comment}</div>
        </div>
      )}

      <div className="stack" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Ответ клиенту</label>
          <textarea
            className="textarea"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Что получилось, что меняем к следующему разу"
          />
        </div>
        {/* Отметка о проверке ставится и без ответа: пустой ответ — это
            «посмотрел, вопросов нет», и клиенту про это знать нечего. */}
        <button className="btn primary block" disabled={busy} onClick={send}>
          {reply.trim() ? 'Ответить и отметить разобранным' : 'Отметить разобранным'}
        </button>
      </div>
    </Sheet>
  )
}

/* ------------------------------ шаги и сон ----------------------------- */

const sleepLabel = (m?: number) => {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ч ${rest} мин` : `${h} ч`
}

function ActivityList({
  rows,
}: {
  rows: { date: string; steps?: number; sleep_minutes?: number }[]
}) {
  const withData = rows.filter((r) => r.steps || r.sleep_minutes)
  if (withData.length === 0) {
    return <div className="empty compact">Клиент не вводил шаги и сон. Это ручной ввод.</div>
  }

  const steps = withData.filter((r) => r.steps).map((r) => r.steps as number)
  const sleep = withData.filter((r) => r.sleep_minutes).map((r) => r.sleep_minutes as number)
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

  return (
    <>
      <div className="card">
        <div className="metrics">
          <div className="metric">
            <div className="num">{steps.length ? avg(steps) : '—'}</div>
            <div className="cap">шагов в среднем</div>
          </div>
          <div className="metric">
            <div className="num">{sleep.length ? sleepLabel(avg(sleep)) : '—'}</div>
            <div className="cap">сна в среднем</div>
          </div>
        </div>
        <div className="mute-sm" style={{ marginTop: 12 }}>
          Данные за {withData.length} {plural(withData.length, ['день', 'дня', 'дней'])} из{' '}
          {WINDOW_DAYS}
        </div>
      </div>

      <Group>
        {withData
          .slice()
          .reverse()
          .map((r) => (
            <Row
              key={r.date}
              title={formatDate(new Date(`${r.date}T12:00:00`).getTime())}
              value={
                <span style={{ fontFamily: 'var(--font-num)' }}>
                  {r.steps ?? '—'} · {sleepLabel(r.sleep_minutes)}
                </span>
              }
            />
          ))}
      </Group>
    </>
  )
}

/* ------------------------------- задание ------------------------------- */

function TaskSheet({
  open,
  clientId,
  trainerId,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  trainerId: string
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
  }, [open])

  const save = async () => {
    setBusy(true)
    try {
      await addTask({ clientId, trainerId, title, description })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Задание клиенту" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Что сделать</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: прислать видео приседа"
          />
        </div>
        <div className="field">
          <label>Подробности</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Зачем это нужно и как сделать"
          />
        </div>
        <button className="btn primary block" disabled={busy || !title.trim()} onClick={save}>
          Выдать задание
        </button>
      </div>
    </Sheet>
  )
}

/* --------------------------- цели на неделю ---------------------------- */

function TargetsSheet({
  open,
  clientId,
  trainerId,
  current,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  trainerId: string
  current?: {
    kcal?: number
    protein?: number
    fat?: number
    carbs?: number
    steps?: number
    note?: string
  }
  onClose: () => void
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues({
      kcal: current?.kcal ? String(current.kcal) : '',
      protein: current?.protein ? String(current.protein) : '',
      fat: current?.fat ? String(current.fat) : '',
      carbs: current?.carbs ? String(current.carbs) : '',
      steps: current?.steps ? String(current.steps) : '',
    })
    setNote(current?.note ?? '')
  }, [open])

  // Пустое поле остаётся пустым: цель, которой не задали, — это не ноль, и
  // подставлять расчётное значение вместо пропуска нельзя.
  const num = (key: string) => {
    const raw = (values[key] ?? '').replace(',', '.').trim()
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const save = async () => {
    setBusy(true)
    try {
      await setWeeklyTargets({
        clientId,
        trainerId,
        kcal: num('kcal'),
        protein: num('protein'),
        fat: num('fat'),
        carbs: num('carbs'),
        steps: num('steps'),
        note,
      })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const field = (key: string, label: string) => (
    <div className="field grow" key={key}>
      <label>{label}</label>
      <input
        className="input"
        inputMode="decimal"
        value={values[key] ?? ''}
        placeholder="—"
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <Sheet open={open} title="Цели на неделю" onClose={onClose}>
      <div className="stack">
        <div className="muted">
          Пустое поле означает, что цели по этой метрике нет — приложение покажет клиенту только
          факт.
        </div>

        <div className="row" style={{ gap: 8 }}>
          {field('kcal', 'Ккал')}
          {field('steps', 'Шаги')}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {field('protein', 'Белки, г')}
          {field('fat', 'Жиры, г')}
          {field('carbs', 'Углеводы, г')}
        </div>

        <div className="field">
          <label>Комментарий</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="На чём держим фокус на этой неделе"
          />
        </div>

        <button className="btn primary block" disabled={busy} onClick={save}>
          Выдать цели
        </button>
      </div>
    </Sheet>
  )
}
