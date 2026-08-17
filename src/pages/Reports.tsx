import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { ClientTask, WorkoutReport, WorkoutSession } from '../db/db'
import { listMySessions } from '../db/repo'
import {
  activityFor,
  completeTask,
  currentTargets,
  issueWeeklyMeasurements,
  myNutritionDayState,
  openTasks,
  repliesOf,
  replyText,
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
import { isOverdue } from '../components/ClientReports'
import { MeasurementEntry } from '../components/MeasurementEntry'
import { ManualMeasurementForm } from '../components/BodyCompositionView'
import { useInBodyImport } from '../components/InBodyImport'
import { IntakeForm } from '../components/IntakeForm'
import { POSES, TaskPhotos } from '../components/TaskPhotos'
import { taskPhotos } from '../db/coach'
import { IconCheck, IconChevronRight, IconTrash } from '../components/Icons'
import { useApp, useTrainerLink } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/** Сколько дней назад ещё имеет смысл сдавать отчёт. */
const WINDOW_DAYS = 14

/** Сколько живёт уехавшая строка. Ровно длительность slide-out. */
const LEAVE_MS = 320

/**
 * Держит исчезнувшую строку ещё мгновение, чтобы она успела уехать.
 *
 * Сдал задание — и оно тут же пропадает из выборки открытых: база права,
 * но человек видит только скачок и не понимает, ушло ли что-нибудь.
 * Хук оставляет строку на месте на время анимации и лишь потом отдаёт
 * список без неё.
 */
function useLeaving<T extends { id: string }>(items: T[] | undefined) {
  const [state, setState] = useState<{ list: T[]; leaving: string[] }>({
    list: items ?? [],
    leaving: [],
  })
  // Сравниваем по составу, а не по ссылке: useLiveQuery отдаёт новый
  // массив на каждое изменение базы, в том числе не касающееся заданий.
  const key = (items ?? []).map((i) => i.id).join(',')
  const shownRef = useRef(state.list)
  shownRef.current = state.list

  useEffect(() => {
    if (!items) return
    const gone = shownRef.current.filter((prev) => !items.some((i) => i.id === prev.id))
    if (!gone.length) {
      setState({ list: items, leaving: [] })
      return
    }
    setState({ list: shownRef.current, leaving: gone.map((g) => g.id) })
    const timer = setTimeout(() => setState({ list: items, leaving: [] }), LEAVE_MS)
    return () => clearTimeout(timer)
  }, [key])

  return state
}

/** Галочка, которая рисуется: у неё есть направление, и взгляд идёт за ним. */
function IconCheckDrawn() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ok)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path className="check-draw" d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  )
}

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
  const sessions = useLiveQuery(() => listMySessions(), [userId])
  // Ответы тренера лежат отдельными строками; поле в самом отчёте читается
  // запасным вариантом — там остались ответы, полученные до разделения.
  const replies = useLiveQuery(() => repliesOf(userId), [userId])
  const reports = useLiveQuery(() => workoutReportsOf(userId), [userId])

  const today = localDate()

  // Замеры выдаются раз в неделю и появляются, как только человек зашёл на
  // этой неделе впервые. Календарного будильника у браузера нет, а результат
  // тот же — в понедельник задание уже на месте.
  useEffect(() => {
    void issueWeeklyMeasurements(userId)
  }, [userId])

  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null)
  const [openTask, setOpenTask] = useState<ClientTask | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)

  // Последнее взвешивание — подпись под кнопкой. Без него непонятно, сдавал
  // ли человек вес сегодня, и он вводит его по второму разу.
  const lastWeight = useLiveQuery(async () => {
    const rows = await db.bodyMetrics.where('user_id').equals(userId).sortBy('logged_at')
    return [...rows].reverse().find((m) => m.weight_kg != null) ?? null
  }, [userId])

  const { list: shownTasks, leaving: leavingTasks } = useLeaving(tasks)

  const loading = tasks === undefined || sessions === undefined || reports === undefined

  const reportOf = new Map((reports ?? []).map((r) => [r.session_id, r]))
  const answerFor = (report?: WorkoutReport) =>
    report ? replyText(replies?.get(report.id), report.trainer_comment) : undefined
  const recent = (sessions ?? []).filter(
    (s) => s.start_time >= Date.now() - WINDOW_DAYS * 86400_000,
  )

  const pendingSessions = recent.filter((s) => reportOf.get(s.id)?.status !== 'submitted')
  const nutritionSubmitted = useLiveQuery(
    async () => (await myNutritionDayState(today)) === 'submitted',
    [today],
    false,
  )
  const pending = pendingSessions.length

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Отчёты')}</h1>
          <div className="sub">
            {t('Тренер')}: {trainerName}
          </div>
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
          {shownTasks.length > 0 && (
            <>
              <div className="section-title">{t('Задания от тренера')}</div>
              <div className="rise-list">
                {shownTasks.map((task, i) => {
                  const out = leavingTasks.includes(task.id)
                  return (
                  <button
                    key={task.id}
                    className={`list-item${out ? ' slide-out' : ''}`}
                    style={{ '--i': i } as React.CSSProperties}
                    disabled={out}
                    onClick={() => setOpenTask(task)}
                  >
                    <div className="grow">
                      {/* Просроченное красным — и у клиента, и у тренера
                          одинаково: это одно и то же событие, и выглядеть
                          оно должно одинаково с обеих сторон. */}
                      <div
                        className="strong"
                        style={isOverdue(task) ? { color: 'var(--danger)' } : undefined}
                      >
                        {t(task.title)}
                      </div>
                      {task.due_at != null && (
                        <div
                          className="mute-sm"
                          style={isOverdue(task) ? { color: 'var(--danger)' } : undefined}
                        >
                          {isOverdue(task) ? t('просрочено') : t('до')} {formatDate(task.due_at)}
                        </div>
                      )}
                      {task.description && (
                        <div className="mute-sm truncate">{t(task.description)}</div>
                      )}
                    </div>
                    {/* Сданное помечается рисующейся галочкой и уезжает
                        вправо — туда же, куда ушёл отчёт. Пока строка
                        исчезала мгновенно, непонятно было, ушла она или её
                        и не было. */}
                    {out ? (
                      <IconCheckDrawn />
                    ) : (
                      <>
                        {task.required === 1 && (
                          <span className="badge">{t('обязательно')}</span>
                        )}
                        <IconChevronRight size={16} />
                      </>
                    )}
                  </button>
                  )
                })}
              </div>
            </>
          )}


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
                    : `${t('последний')} — ${formatWeight(lastWeight.weight_kg)} ${t('кг')}, ${formatDate(lastWeight.logged_at)}`}
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

          {/* Только несданные: экран отвечает на вопрос «что с меня ещё
              причитается». Сданное уже ушло тренеру, и висеть в списке дел
              ему незачем — а список, где половина строк ничего не требует,
              перестают читать. Ответы тренера приходят в саму тренировку. */}
          <div className="section-title">{t('Видео-отчёты по тренировкам')}</div>
          {pendingSessions.length === 0 ? (
            <div className="empty compact">{t('Все тренировки сданы.')}</div>
          ) : (
            <div className="rise-list">
              {pendingSessions.map((s, i) => (
                <ReportRow
                  key={s.id}
                  index={i}
                  title={t(s.title)}
                  subtitle={formatDate(s.start_time)}
                  submitted={false}
                  answered={false}
                  onOpen={() => setOpenSession(s)}
                />
              ))}
            </div>
          )}

          {/* Дни питания сдаются в самом дневнике, под тем, что за день
              съедено: отчёт о еде осмыслен рядом с едой, а не списком дат в
              отрыве от неё. Форма — components/NutritionDayReport. */}
          {/* Сдан ли день, видно отсюда: иначе за ответом приходится идти в
              дневник, а вопрос «я сегодня отчитался?» задают именно здесь. */}
          <div className="section-title">{t('Питание')}</div>
          <button className="list-item" onClick={() => nav('/nutrition')}>
            <div className="grow">
              <div className="strong">
                {nutritionSubmitted ? t('Отчёт за сегодня сдан') : t('Открыть дневник')}
              </div>
              <div className="mute-sm">
                {nutritionSubmitted
                  ? t('Можно поправить в дневнике')
                  : t('Отчёт за день сдаётся под записями о еде')}
              </div>
            </div>
            {nutritionSubmitted ? <IconCheck size={16} /> : <IconChevronRight size={16} />}
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
        reply={openSession ? answerFor(reportOf.get(openSession.id)) : undefined}
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
  const [tasksOpen, setTasksOpen] = useState(false)
  const entries = useLiveQuery(() => (open ? submittedEntries(userId) : undefined), [userId, open])

  return (
    <>
      {/* Отчёты и задания разведены: это разные вопросы — «что я сдал» и
          «что я выполнил», и общий список отвечал сразу на оба нечётко. */}
      <div className="section-title">{t('Сданное')}</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={() => { setOpen((v) => !v); setTasksOpen(false) }}>
          {t('Сданные отчёты')}
        </button>
        <button className="btn grow" onClick={() => { setTasksOpen((v) => !v); setOpen(false) }}>
          {t('Сданные задания')}
        </button>
      </div>

      {tasksOpen && <SubmittedTasks userId={userId} />}

      {!open ? null : entries == null ? (
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
              </span>
              <button
                className="icon-btn"
                aria-label={`${t('Удалить')}: ${t(e.title)} · ${formatDate(e.at)}`}
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

/**
 * Выполненные задания — архив клиента.
 *
 * Принял ли их тренер, здесь не показывается: клиент своё сдал, и стадия
 * проверки — забота тренера, а не повод гадать, всё ли он сделал правильно.
 */
function SubmittedTasks({ userId }: { userId: string }) {
  const tasks = useLiveQuery(
    async () => (await db.tasks.where('[client_id+status]').equals([userId, 'done']).toArray())
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0)),
    [userId],
  )

  if (tasks == null) return <div className="card skeleton" style={{ height: 96 }} />
  if (tasks.length === 0) return <div className="empty compact">{t('Заданий пока не сдано.')}</div>

  return (
    <div className="group">
      {tasks.map((task) => (
        <div className="group-row" key={task.id}>
          <span className="grow">
            <span className="title">{t(task.title)}</span>
            <span className="sub">
              {task.completed_at ? formatDate(task.completed_at) : ''}
              {task.answer ? ` · ${task.answer}` : ''}
            </span>
          </span>
          <IconCheck size={16} />
        </div>
      ))}
    </div>
  )
}

/* ------------------------------- строки ------------------------------- */

function ReportRow({
  title,
  subtitle,
  submitted,
  answered,
  index = 0,
  onOpen,
}: {
  title: string
  subtitle?: string
  submitted: boolean
  answered: boolean
  /** Место в списке — по нему считается задержка появления. */
  index?: number
  onOpen: () => void
}) {
  return (
    <button className="list-item" style={{ '--i': index } as React.CSSProperties} onClick={onOpen}>
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


/* ------------------------------ шаги и сон ----------------------------- */

/** Часы с дробной частью удобнее двух полей, но в базе лежат минуты. */
const hoursToMinutes = (v: string) => {
  const h = parseFloat(v.replace(',', '.'))
  // Ноль — такой же честный ответ, как и любой другой: бывают ночи без сна.
  return Number.isFinite(h) && h >= 0 ? Math.round(h * 60) : undefined
}

// Ноль — записанное значение, а не пустое поле: иначе введённый ноль сразу
// после сохранения исчезал бы из формы, а кнопка оставалась активной.
const minutesToHours = (m?: number) =>
  m === undefined ? '' : String(Math.round((m / 60) * 10) / 10)

/** Тысячи разделяем: «8 240» читается с одного взгляда, «8240» — нет. */
const formatSteps = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')

function ActivityCard({ date, userId }: { date: string; userId: string }) {
  const { toast } = useApp()
  // Цель по шагам стоит рядом с фактом, а не отдельной таблицей целей:
  // «8 240 из 10 000» отвечает на вопрос сразу, а список целей заставляет
  // держать число в голове и возвращаться к нему глазами.
  const targets = useLiveQuery(() => currentTargets(userId), [userId])
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
  /**
   * Записанный день показываем итогом, а не открытой формой.
   *
   * Форма с заполненными полями и активной кнопкой выглядит как несделанное
   * дело: человек не знает, ушло ли уже число, и вводит его заново. Итог
   * отвечает на этот вопрос сразу, а править по-прежнему можно — но это
   * отдельное решение, а не случайный тап по полю.
   */
  const [editing, setEditing] = useState(false)
  const savedSteps = saved?.steps === undefined ? '' : String(saved.steps)
  const savedSleep = minutesToHours(saved?.sleep_minutes)
  const steps = draft?.steps ?? savedSteps
  const sleep = draft?.sleep ?? savedSleep

  const raw = steps.replace(/\s/g, '')
  const stepsNum = raw ? Number(raw) : undefined
  const sleepNum = sleep.trim() ? hoursToMinutes(sleep) : undefined
  // Пустое поле — это «не вводил», а не ноль; мусор в поле сохранять нельзя.
  const valid =
    (stepsNum === undefined || (Number.isFinite(stepsNum) && stepsNum >= 0)) &&
    (!sleep.trim() || sleepNum !== undefined)

  // Сравниваем числа, а не текст: «7,5» и «7.5» — одно и то же значение, и
  // после сохранения введённого через запятую кнопка иначе оставалась бы
  // активной, как будто запись не прошла.
  const dirty =
    (stepsNum === undefined ? undefined : Math.round(stepsNum)) !== saved?.steps ||
    sleepNum !== saved?.sleep_minutes

  const save = async () => {
    await setDailyActivity({
      date,
      // Очищенное поле стирает значение, а не оставляет прежнее: человек
      // видел бы пустую форму при сохранённом старом числе.
      steps: raw ? Math.round(stepsNum!) : null,
      sleepMinutes: sleep.trim() ? sleepNum : null,
      userId,
    })
    // Черновик снимаем: дальше поля показывают то, что действительно записано.
    setDraft(null)
    setEditing(false)
    haptics.success()
    toast(t('Записано'))
  }

  // Ноль шагов и ноль часов сна — записанные значения, поэтому проверяем
  // наличие поля, а не его истинность.
  const hasSteps = saved?.steps !== undefined
  const hasSleep = saved?.sleep_minutes !== undefined
  const recorded = hasSteps || hasSleep

  if (recorded && !editing) {
    return (
      <div className="card">
        <div className="row between">
          <div className="strong">{t('Записано за сегодня')}</div>
          <span className="badge">{t('записано')}</span>
        </div>

        <div className="group mt-3">
          <div className="group-row">
            <span className="grow title">{t('Шаги')}</span>
            <span className="value figures">
              {hasSteps ? formatSteps(saved!.steps!) : t('не введено')}
              {targets?.steps ? ` / ${formatSteps(targets.steps)}` : ''}
            </span>
          </div>
          <div className="group-row">
            <span className="grow title">{t('Сон')}</span>
            <span className="value figures">
              {hasSleep ? `${minutesToHours(saved!.sleep_minutes)} ${t('ч')}` : t('не введено')}
            </span>
          </div>
        </div>

        <button className="btn block mt-3" onClick={() => setEditing(true)}>
          {t('Изменить')}
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8 }}>
        <div className="field grow">
          <label>
            {t('Шаги')}
            {targets?.steps ? ` · ${t('цель')} ${formatSteps(targets.steps)}` : ''}
          </label>
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
          {t('Вводится вручную — приложению в браузере шаги и сон не отдаёт ни одна система.')}
        </div>
      )}

      <button
        className="btn primary block mt-3"
        disabled={!dirty || !valid}
        onClick={save}
      >
        {t('Сохранить')}
      </button>

      {/* Выход из правки нужен только тогда, когда есть куда возвращаться:
          на пустом дне отменять нечего, и кнопка была бы тупиком. */}
      {recorded && (
        <button
          className="btn block mt-2"
          onClick={() => {
            setDraft(null)
            setEditing(false)
          }}
        >
          {t('Отмена')}
        </button>
      )}
    </div>
  )
}

/* -------------------------------- задание ------------------------------ */

/**
 * Задание клиенту — и сразу то, чем оно выполняется.
 *
 * Каждый вид закрывается сделанным делом, а не отметкой о нём: замеры —
 * заполненной таблицей, InBody — разобранным отчётом, фото — снятыми
 * кадрами, анкета и эссе — написанным текстом. Кнопки «Готово», которая
 * закрывала бы задание сама по себе, здесь нет ни у одного вида: пока она
 * была, тренер получал «выполнено» без единой цифры и шёл выяснять в чат,
 * сделано ли что-нибудь на самом деле.
 *
 * Ссылки «открыть замеры в другом разделе» тоже нет. Она уводила из
 * задания, и человек, вернувшись, всё равно должен был нажать «Готово» —
 * то есть задание закрывала кнопка, а не сданный замер.
 */
function TaskSheet({ task, onClose }: { task: ClientTask | null; onClose: () => void }) {
  if (!task) return null

  return (
    <Sheet open={!!task} title={t(task.title)} onClose={onClose}>
      {task.description && <div className="muted">{t(task.description)}</div>}

      {/* Анкета — не «ответ текстом», а форма: часть её вопросов заводит
          профиль и первую точку веса, и свободным полем это не собрать. */}
      {task.kind === 'intake' ? (
        <IntakeForm task={task} onDone={onClose} />
      ) : task.kind === 'photos' ? (
        <PhotoTaskForm task={task} onDone={onClose} />
      ) : task.kind === 'measurements' ? (
        <MeasurementTaskForm task={task} onDone={onClose} />
      ) : task.kind === 'inbody' ? (
        <InBodyTaskForm task={task} onDone={onClose} />
      ) : (
        <TextTaskForm task={task} onDone={onClose} />
      )}
    </Sheet>
  )
}

/**
 * Черновики ответов по заданиям.
 *
 * Живут вне компонента, а не в его ref: шторка закрывается тапом мимо неё и
 * по Escape, без подтверждения, и вместе с ней размонтируется форма. Пока
 * черновик лежал внутри неё, написанное эссе пропадало от одного
 * случайного касания.
 */
const taskDrafts = new Map<string, string>()

/**
 * Эссе и задание, придуманное тренером: делом здесь служит написанный текст.
 *
 * Пустой ответ не принимается и у произвольного задания: «выполнено» без
 * единого слова ничем не отличается от невыполненного — тренер всё равно
 * идёт спрашивать в чат, что именно сделано.
 */
function TextTaskForm({ task, onDone }: { task: ClientTask; onDone: () => void }) {
  const { toast } = useApp()
  const [answer, setAnswer] = useState(() => taskDrafts.get(task.id) ?? task.answer ?? '')
  const [busy, setBusy] = useState(false)

  const essay = task.kind === 'essay'

  const send = async () => {
    setBusy(true)
    try {
      await completeTask(task.id, answer)
      taskDrafts.delete(task.id)
      haptics.success()
      toast(t('Задание отправлено тренеру'))
      onDone()
    } catch {
      // Молча закрывать шторку нельзя: человек решит, что задание отправлено.
      toast(t('Не удалось сохранить — попробуйте ещё раз'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack mt-4">
      <div className="field">
        <label>{essay ? t('Ваш ответ') : t('Что сделано')}</label>
        <textarea
          className="textarea"
          style={essay ? { minHeight: 160 } : undefined}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value)
            taskDrafts.set(task.id, e.target.value)
          }}
          placeholder={
            essay
              ? t('Пишите как есть — это для вас и для тренера')
              : t('Опишите, что сделали: это и есть отчёт')
          }
        />
      </div>
      <button className="btn primary block" disabled={busy || !answer.trim()} onClick={send}>
        {t('Отправить тренеру')}
      </button>
    </div>
  )
}

/**
 * Фото до/после: задание закрывают сами снимки.
 *
 * Просят четыре ракурса, сдать можно с трёх. Одного-двух кадров через месяц
 * не с чем сравнивать, а требовать все четыре значит запереть человека,
 * которому четвёртый снять некому: он не сдаст ничего вместо трёх кадров,
 * по которым разговор уже возможен. Недостающий ракурс при этом назван —
 * тренер видит, чего нет, не открывая задание.
 */
const MIN_SHOTS = 3

function PhotoTaskForm({ task, onDone }: { task: ClientTask; onDone: () => void }) {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const version = useLiveQuery(() => db.attachments.count(), [])
  const photos = useLiveQuery(() => taskPhotos(task.id, userId), [task.id, userId, version], [])
  const [comment, setComment] = useState(() => taskDrafts.get(task.id) ?? task.answer ?? '')
  const [busy, setBusy] = useState(false)

  const missing = POSES.filter((p) => !photos.some((x) => x.pose === p.key))
  const enough = POSES.length - missing.length >= MIN_SHOTS

  const send = async () => {
    setBusy(true)
    try {
      await completeTask(task.id, comment)
      taskDrafts.delete(task.id)
      haptics.success()
      toast(t('Фото отправлены тренеру'))
      onDone()
    } catch {
      toast(t('Не удалось сохранить — попробуйте ещё раз'))
    } finally {
      setBusy(false)
    }
  }

  /*
   * Снимать по-прежнему можно прямо здесь, а не только на «Прогрессе в фото».
   *
   * Соблазн увести задание на новый экран был: там та же сетка и там же
   * история. Но задание — это отчёт, и закрывается он одним действием в
   * одном месте: уведи съёмку — и человеку придётся уйти с задания, снять
   * четыре кадра, вернуться и нажать «Отправить», помня зачем. Кадры от
   * этого никуда не заперты: у них теперь есть дата, и в ленту серий они
   * встают сами. Ссылка ниже — на случай, когда пришли сравнить, а не сдать.
   */
  return (
    <div className="stack mt-4">
      <TaskPhotos taskId={task.id} userId={userId} />

      <button
        className="btn ghost block"
        onClick={() => {
          onDone()
          nav('/progress/photos')
        }}
      >
        {t('Все серии фото')}
      </button>

      <div className="field">
        <label>{t('Комментарий тренеру, если нужен')}</label>
        <textarea
          className="textarea"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value)
            taskDrafts.set(task.id, e.target.value)
          }}
        />
      </div>

      {/* Чего не хватает, говорим до нажатия, а не отключённой кнопкой без
          объяснения: иначе человек с двумя кадрами не понимает, что не так.
          При трёх снимках это уже не запрет, а напоминание — отправить
          можно, и лучше дослать четвёртый, чем не сдать ничего. */}
      {missing.length > 0 && (
        <div className="mute-sm">
          {enough ? t('Не хватает кадра') : t('Не хватает кадров')}:{' '}
          {missing.map((p) => t(p.label).toLowerCase()).join(', ')}
          {!enough && `. ${t('Сдать можно с трёх.')}`}
        </div>
      )}

      <button className="btn primary block" disabled={busy || !enough} onClick={send}>
        {t('Отправить тренеру')}
      </button>
    </div>
  )
}

/**
 * Замеры: та же таблица, что в разделе «Тело», прямо внутри задания.
 *
 * Задание закрывается сохранённым замером и ссылается на него — тренер
 * открывает ровно те цифры, которые прислал клиент, а не «выполнено».
 */
function MeasurementTaskForm({ task, onDone }: { task: ClientTask; onDone: () => void }) {
  const { toast, userId } = useApp()

  return (
    <div className="mt-4">
      <ManualMeasurementForm
        userId={userId}
        submitLabel={t('Сдать замеры тренеру')}
        onSaved={async (res) => {
          await completeTask(task.id, undefined, undefined, res.id)
          haptics.success()
          toast(t('Замеры сданы'))
          onDone()
        }}
      />
    </div>
  )
}

/**
 * InBody: задание закрывает разобранный отчёт, а не нажатие кнопки.
 *
 * Разбор идёт на устройстве, поэтому цифры видно до отправки — и сдаётся
 * именно замер, который тренер потом откроет из задания.
 */
function InBodyTaskForm({ task, onDone }: { task: ClientTask; onDone: () => void }) {
  const { toast, userId } = useApp()

  const inbody = useInBodyImport({
    userId,
    onImported: async (ids) => {
      if (!ids.length) return
      // Из пачки берём последний по дате: задание про свежий замер, а
      // остальные просто лягут в историю.
      await completeTask(task.id, undefined, undefined, ids[ids.length - 1])
      toast(t('Отчёт InBody сдан'))
      onDone()
    },
  })

  return (
    <div className="stack mt-4">
      <div className="muted">
        {t('Загрузите PDF из зала — приложение прочитает его само и покажет, что получилось.')}
      </div>
      <button className="btn primary block" disabled={inbody.busy} onClick={inbody.pick}>
        {inbody.busy
          ? inbody.progress && inbody.progress.total > 1
            ? `${t('Читаю')} ${inbody.progress.done + 1} ${t('из')} ${inbody.progress.total}…`
            : t('Читаю отчёт…')
          : t('Выбрать PDF отчёта')}
      </button>
      {inbody.node}
    </div>
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
  reply,
  onClose,
}: {
  session: WorkoutSession | null
  report?: WorkoutReport
  reply?: string
  onClose: () => void
}) {
  const { toast } = useApp()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  // Написанное переживает закрытие шторки: закрыть её можно случайным тапом
  // мимо, а подтверждения здесь нет.
  const drafts = useRef(new Map<string, string>())

  useEffect(() => {
    if (!session) return
    setComment(drafts.current.get(session.id) ?? report?.client_comment ?? '')
  }, [session?.id, report?.id])

  if (!session) return null

  const submitted = report?.status === 'submitted'

  const send = async () => {
    setBusy(true)
    try {
      await submitWorkoutReport(session.id, comment)
      drafts.current.delete(session.id)
      haptics.success()
      toast(submitted ? t('Отчёт обновлён') : t('Отчёт сдан'))
      onClose()
    } catch {
      toast(t('Не удалось сдать отчёт — попробуйте ещё раз'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!session} title={t(session.title)} onClose={onClose}>
      <div className="mute-sm">{formatDate(session.start_time)}</div>

      <TrainerReply text={reply} />

      <div className="stack mt-4">
        <div className="field">
          <label>{t('Как прошла тренировка')}</label>
          <textarea
            className="textarea"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              drafts.current.set(session.id, e.target.value)
            }}
            placeholder={t('Самочувствие, что было тяжело, что болело')}
          />
        </div>
        <button className="btn primary block" disabled={busy} onClick={send}>
          {submitted ? t('Обновить отчёт') : t('Сдать тренировку')}
        </button>
      </div>
    </Sheet>
  )
}
