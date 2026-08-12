import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { ClientTask, NutritionTarget, WorkoutReport, WorkoutSession } from '../db/db'
import { listMySessions } from '../db/repo'
import {
  activityFor,
  completeTask,
  currentTargets,
  openTasks,
  setDailyActivity,
  deleteSubmittedEntry,
  submittedEntries,
  submitWorkoutReport,
  workoutReportsOf,
} from '../db/reports'
import { formatDate, formatWeight, plural } from '../lib/calc'
import { localDate } from '../lib/tdee'
import { canImportHealthData, healthProvider } from '../lib/health'
import { Sheet } from '../components/Sheet'
import { WeightSheet } from '../components/WeightCard'
import { MeasurementEntry } from '../components/MeasurementEntry'
import { IconCheck, IconChevronRight, IconTrash } from '../components/Icons'
import { useApp, useTrainerLink } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/** Сколько дней назад ещё имеет смысл сдавать отчёт. */
const WINDOW_DAYS = 14

/**
 * Отчёты клиента тренеру.
 *
 * Экран действий: выполнить задание, ввести шаги и сон, сдать тренировку.
 * Всё остальное сдаётся там, где живёт: веса и замеры — в своих разделах,
 * день питания — в дневнике, под тем, что за день съедено. Сюда они приходят
 * строкой «не сдано» со ссылкой туда, а не второй формой ввода того же.
 * Питание сейчас снято с интерфейса целиком, поэтому его строки здесь нет —
 * см. комментарий ниже по файлу.
 *
 * Клиент видит у отчёта ровно два состояния — не сдан и сдан. Стадия
 * проверки тренером сюда не доходит и доходить не должна: человек не
 * должен гадать, почему его отчёт «ещё смотрят». Ответ тренера — другое
 * дело, он адресован клиенту и показывается на самом отчёте.
 */
export function Reports() {
  const bond = useTrainerLink()

  if (bond === undefined) {
    return (
      <div className="screen">
        <div className="empty">{t('Загрузка…')}</div>
      </div>
    )
  }

  if (!bond) {
    return (
      <div className="screen">
        <div className="header">
          <h1>{t('Отчёты')}</h1>
        </div>
        <div className="empty">
          {t('Отчёты сдаются тренеру. Код приглашения вводится в профиле.')}
        </div>
      </div>
    )
  }

  return <ReportsBoard trainerName={bond.trainer.name} />
}

function ReportsBoard({ trainerName }: { trainerName: string }) {
  const { toast, userId } = useApp()
  const nav = useNavigate()

  const tasks = useLiveQuery(() => openTasks(userId), [userId])
  const targets = useLiveQuery(() => currentTargets(userId), [userId])
  const sessions = useLiveQuery(() => listMySessions(), [userId])
  const reports = useLiveQuery(() => workoutReportsOf(userId), [userId])

  const today = localDate()

  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null)
  const [openTask, setOpenTask] = useState<ClientTask | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)

  // Последнее взвешивание — подпись под кнопкой. Без него непонятно, сдавал
  // ли человек вес сегодня, и он вводит его по второму разу.
  const lastWeight = useLiveQuery(async () => {
    const rows = await db.bodyMetrics.where('user_id').equals(userId).sortBy('logged_at')
    return [...rows].reverse().find((m) => m.weight_kg != null) ?? null
  }, [userId])

  const loading = tasks === undefined || sessions === undefined || reports === undefined

  const reportOf = new Map((reports ?? []).map((r) => [r.session_id, r]))
  const recent = (sessions ?? []).filter(
    (s) => s.start_time >= Date.now() - WINDOW_DAYS * 86400_000,
  )

  const pending = recent.filter((s) => reportOf.get(s.id)?.status !== 'submitted').length

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Отчёты')}</h1>
          <div className="sub">Тренер: {trainerName}</div>
        </div>
        {!loading && pending > 0 && (
          <span className="badge">
            {pending} {plural(pending, ['не сдан', 'не сданы', 'не сданы'])}
          </span>
        )}
      </div>

      {loading ? (
        <div className="empty">{t('Загрузка…')}</div>
      ) : (
        <>
          {tasks.length > 0 && (
            <>
              <div className="section-title">{t('Задания от тренера')}</div>
              <div>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    className="list-item"
                    onClick={() => setOpenTask(task)}
                  >
                    <div className="grow">
                      <div className="strong">{task.title}</div>
                      {task.description && (
                        <div className="mute-sm truncate">{task.description}</div>
                      )}
                    </div>
                    {task.required === 1 && <span className="badge">{t('обязательно')}</span>}
                    <IconChevronRight size={16} />
                  </button>
                ))}
              </div>
            </>
          )}

          {targets && <TargetsCard targets={targets} />}

          {/* Всё про тело сдаётся здесь, а не на экране «Анализ тела»:
              туда приходят смотреть динамику, и предложение что-то
              загрузить в начале мешает этому. */}
          <div className="section-title">{t('Тело')}</div>
          <div className="group">
            <button className="group-row" onClick={() => setWeightOpen(true)}>
              <span className="grow">
                <span className="title">{t('Сдать вес')}</span>
                <span className="sub">
                  {lastWeight == null
                    ? t('ещё не вносили')
                    : `${t('последний')} — ${formatWeight(lastWeight.weight_kg)} кг, ${formatDate(lastWeight.logged_at)}`}
                </span>
              </span>
              <span className="chevron">
                <IconChevronRight size={16} />
              </span>
            </button>
          </div>
          <MeasurementEntry userId={userId} />

          <div className="section-title">{t('Шаги и сон за сегодня')}</div>
          <ActivityCard date={today} userId={userId} />

          <div className="section-title">{t('Видео-отчёты по тренировкам')}</div>
          {recent.length === 0 ? (
            <div className="empty compact">
              За последние {WINDOW_DAYS} дней тренировок не было — сдавать пока нечего.
            </div>
          ) : (
            <div>
              {recent.map((s) => (
                <ReportRow
                  key={s.id}
                  title={s.title}
                  subtitle={formatDate(s.start_time)}
                  submitted={reportOf.get(s.id)?.status === 'submitted'}
                  answered={!!reportOf.get(s.id)?.trainer_comment}
                  onOpen={() => setOpenSession(s)}
                />
              ))}
            </div>
          )}

          {/* Дни питания сдаются в самом дневнике, под тем, что за день
              съедено: отчёт о еде осмыслен рядом с едой, а не списком дат в
              отрыве от неё. Форма — components/NutritionDayReport. */}
          <div className="section-title">{t('Питание')}</div>
          <button className="list-item" onClick={() => nav('/nutrition')}>
            <div className="grow">
              <div className="strong">{t('Открыть дневник')}</div>
              <div className="mute-sm">{t('Отчёт за день сдаётся под записями о еде')}</div>
            </div>
            <IconChevronRight size={16} />
          </button>

          <SubmittedList userId={userId} onToast={toast} />
        </>
      )}

      <WeightSheet
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        onSaved={() => toast(t('Вес записан'))}
      />
      <TaskSheet task={openTask} onClose={() => setOpenTask(null)} />
      <WorkoutReportSheet
        session={openSession}
        report={openSession ? reportOf.get(openSession.id) : undefined}
        onClose={() => setOpenSession(null)}
      />
    </div>
  )
}

/**
 * Что уже сдано — коротко, с возможностью удалить.
 *
 * Удаление здесь не про «передумал», а про опечатку: лишний ноль в весе
 * перекашивает график, расчёт расхода и рекомендации тренера. Раньше
 * исправить это было нельзя — оставалось смотреть на сломанную статистику
 * или чистить всю историю целиком.
 *
 * Список свёрнут: он длинный и нужен редко, а место занимал бы всегда.
 */
function SubmittedList({
  userId,
  onToast,
}: {
  userId: string
  onToast: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const entries = useLiveQuery(() => (open ? submittedEntries(userId) : undefined), [userId, open])

  return (
    <>
      <div className="section-title">{t('Сданные отчёты')}</div>
      {!open ? (
        <button className="list-item" onClick={() => setOpen(true)}>
          <div className="grow">
            <div className="strong">{t('Показать сданное')}</div>
            <div className="mute-sm">{t('Вес, замеры, InBody, шаги и сон — с возможностью удалить')}</div>
          </div>
          <IconChevronRight size={16} />
        </button>
      ) : entries == null ? (
        <div className="card skeleton" style={{ height: 120 }} />
      ) : entries.length === 0 ? (
        <div className="empty compact">{t('Пока ничего не сдано.')}</div>
      ) : (
        <div className="group">
          {entries.map((e) => (
            <div className="group-row" key={`${e.kind}-${e.id}`}>
              <span className="grow">
                <span className="title">
                  {t(e.title)} · {formatDate(e.at)}
                </span>
                <span className="sub">{e.detail || t('без цифр')}</span>
                {/* Ответ тренера показываем здесь же: разбор замера иначе
                    остался бы у него на экране, а клиент так и не узнал бы,
                    что его прочитали. */}
                {e.reply && <span className="sub quote mt-1">{e.reply}</span>}
              </span>
              <button
                className="icon-btn"
                aria-label={`Удалить: ${e.title} от ${formatDate(e.at)}`}
                onClick={async () => {
                  await deleteSubmittedEntry(e)
                  onToast(t('Запись удалена'))
                }}
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ------------------------------- строки ------------------------------- */

function ReportRow({
  title,
  subtitle,
  submitted,
  answered,
  onOpen,
}: {
  title: string
  subtitle?: string
  submitted: boolean
  answered: boolean
  onOpen: () => void
}) {
  return (
    <button className="list-item" onClick={onOpen}>
      <div className="grow">
        <div className="truncate strong">
          {title}
        </div>
        {subtitle && <div className="mute-sm">{subtitle}</div>}
      </div>
      {answered && <span className="badge pro">{t('ответ')}</span>}
      {submitted ? (
        <span className="badge">
          <IconCheck size={11} />
          {t('сдан')}
        </span>
      ) : (
        <span className="badge">{t('не сдан')}</span>
      )}
      <IconChevronRight size={16} />
    </button>
  )
}

/* ------------------------------ недельные цели ------------------------- */

function TargetsCard({ targets }: { targets: NutritionTarget }) {
  const rows: [string, string][] = []
  if (targets.kcal) rows.push(['Калории', `${targets.kcal} ккал`])
  if (targets.protein) rows.push(['Белки', `${targets.protein} г`])
  if (targets.fat) rows.push(['Жиры', `${targets.fat} г`])
  if (targets.carbs) rows.push(['Углеводы', `${targets.carbs} г`])
  if (targets.steps) rows.push(['Шаги', String(targets.steps)])

  // Цель без единого заполненного поля — только заметка; таблицу в этом
  // случае рисовать не из чего.
  if (!rows.length && !targets.note) return null

  return (
    <>
      <div className="section-title">{t('Цели на неделю')}</div>
      <div className="card">
        {rows.length > 0 && (
          <div className="group">
            {rows.map(([label, value]) => (
              <div className="group-row" key={label}>
                <span className="grow title">{label}</span>
                <span className="value figures">
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
        {targets.note && (
          <div
            className={`mute-sm quote${rows.length ? ' mt-3' : ''}`}
          >
            {targets.note}
          </div>
        )}
      </div>
    </>
  )
}

/* ------------------------------ шаги и сон ----------------------------- */

/** Часы с дробной частью удобнее двух полей, но в базе лежат минуты. */
const hoursToMinutes = (v: string) => {
  const h = parseFloat(v.replace(',', '.'))
  return Number.isFinite(h) && h > 0 ? Math.round(h * 60) : undefined
}

const minutesToHours = (m?: number) => (m ? String(Math.round((m / 60) * 10) / 10) : '')

function ActivityCard({ date, userId }: { date: string; userId: string }) {
  const { toast } = useApp()
  const saved = useLiveQuery(() => activityFor(date, userId), [date, userId])
  // Умеет ли источник забирать данные сам. В вебе — нет, и решает это
  // провайдер, а не проверка платформы, разбросанная по экранам.
  const canImport = useLiveQuery(() => canImportHealthData(), [])

  /**
   * Черновик отдельно от сохранённого. Пока его нет, поля показывают базу —
   * значение могло приехать с другого устройства уже после открытия экрана.
   * Как только человек напечатал, побеждает напечатанное: подставлять ему
   * под руку старое значение после сохранения нельзя.
   */
  const [draft, setDraft] = useState<{ steps: string; sleep: string } | null>(null)
  const savedSteps = saved?.steps ? String(saved.steps) : ''
  const savedSleep = minutesToHours(saved?.sleep_minutes)
  const steps = draft?.steps ?? savedSteps
  const sleep = draft?.sleep ?? savedSleep
  const dirty = steps !== savedSteps || sleep !== savedSleep

  const raw = steps.replace(/\s/g, '')
  const stepsNum = raw ? Number(raw) : undefined
  const sleepNum = hoursToMinutes(sleep)
  // Пустое поле — это «не вводил», а не ноль; мусор в поле сохранять нельзя.
  const valid =
    (stepsNum === undefined || (Number.isFinite(stepsNum) && stepsNum >= 0)) &&
    (!sleep.trim() || sleepNum !== undefined)

  const save = async () => {
    await setDailyActivity({
      date,
      steps: stepsNum === undefined ? undefined : Math.round(stepsNum),
      sleepMinutes: sleepNum,
      userId,
    })
    haptics.success()
    toast('Записано')
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8 }}>
        <div className="field grow">
          <label>{t('Шаги')}</label>
          <input
            className="input"
            inputMode="numeric"
            value={steps}
            placeholder="—"
            onChange={(e) => setDraft({ steps: e.target.value, sleep })}
          />
        </div>
        <div className="field grow">
          <label>{t('Сон, ч')}</label>
          <input
            className="input"
            inputMode="decimal"
            value={sleep}
            placeholder="—"
            onChange={(e) => setDraft({ steps, sleep: e.target.value })}
          />
        </div>
      </div>

      {/* Про автоматическую подгрузку решает провайдер, а не этот экран:
          в вебе он всегда отвечает «не умею», и обещания импорта здесь не
          появляется. Когда приложение упакуют в нативную обёртку и
          провайдера подменят, кнопка возникнет сама — см. lib/health.ts. */}
      {canImport ? (
        <div className="mute-sm mt-3">
          Можно подтянуть из «{healthProvider().name}» или ввести руками.
        </div>
      ) : (
        <div className="mute-sm mt-3">
          Вводится вручную — приложению в браузере шаги и сон не отдаёт ни одна система.
        </div>
      )}

      <button
        className="btn primary block mt-3"
        disabled={!dirty || !valid}
        onClick={save}
      >
        Сохранить
      </button>
    </div>
  )
}

/* -------------------------------- задание ------------------------------ */

/** Куда ведёт задание, если выполняется оно не текстом, а в другом разделе. */
const TASK_ROUTE: Partial<Record<ClientTask['kind'], { to: string; label: string }>> = {
  intake: { to: '/profile', label: 'Открыть профиль' },
  measurements: { to: '/body', label: 'Открыть замеры' },
  inbody: { to: '/body', label: 'Загрузить InBody' },
}

function TaskSheet({ task, onClose }: { task: ClientTask | null; onClose: () => void }) {
  const nav = useNavigate()
  const { toast } = useApp()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setAnswer(task?.answer ?? ''), [task?.id])

  if (!task) return null

  const route = TASK_ROUTE[task.kind]
  // Эссе — это и есть ответ: отметить его выполненным, ничего не написав,
  // означало бы закрыть задание, которого никто не сделал.
  const needsText = task.kind === 'essay'

  const done = async () => {
    setBusy(true)
    try {
      await completeTask(task.id, answer)
      haptics.success()
      toast('Задание выполнено')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!task} title={task.title} onClose={onClose}>
      {task.description && <div className="muted">{task.description}</div>}

      <div className="stack mt-4">
        <div className="field">
          <label>{needsText ? 'Ваш ответ' : 'Комментарий тренеру, если нужен'}</label>
          <textarea
            className="textarea"
            style={needsText ? { minHeight: 160 } : undefined}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={needsText ? 'Пишите как есть — это для вас и для тренера' : ''}
          />
        </div>

        {route && (
          <button
            className="btn block"
            onClick={() => {
              onClose()
              nav(route.to)
            }}
          >
            {route.label}
          </button>
        )}

        <button
          className="btn primary block"
          disabled={busy || (needsText && !answer.trim())}
          onClick={done}
        >
          Готово
        </button>
      </div>
    </Sheet>
  )
}

/* ---------------------------- отчёт о тренировке ----------------------- */

function TrainerReply({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="card mt-3">
      <div className="mute-sm">{t('Ответ тренера')}</div>
      <div className="mt-1">{text}</div>
    </div>
  )
}

function WorkoutReportSheet({
  session,
  report,
  onClose,
}: {
  session: WorkoutSession | null
  report?: WorkoutReport
  onClose: () => void
}) {
  const { toast } = useApp()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setComment(report?.client_comment ?? ''), [session?.id, report?.id])

  if (!session) return null

  const submitted = report?.status === 'submitted'

  const send = async () => {
    setBusy(true)
    try {
      await submitWorkoutReport(session.id, comment)
      haptics.success()
      toast(submitted ? 'Отчёт обновлён' : 'Отчёт сдан')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!session} title={session.title} onClose={onClose}>
      <div className="mute-sm">{formatDate(session.start_time)}</div>

      <TrainerReply text={report?.trainer_comment} />

      <div className="stack mt-4">
        <div className="field">
          <label>{t('Как прошла тренировка')}</label>
          <textarea
            className="textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('Самочувствие, что было тяжело, что болело')}
          />
        </div>
        <button className="btn primary block" disabled={busy} onClick={send}>
          {submitted ? 'Обновить отчёт' : 'Сдать тренировку'}
        </button>
      </div>
    </Sheet>
  )
}
