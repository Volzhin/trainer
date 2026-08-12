import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, modeOf, type Program, type TrainerLink } from '../../db/db'
import {
  assignProgram,
  createPersonalProgram,
  loadClientDetail,
  removeLink,
  setLinkMode,
  setLinkPayment,
} from '../../db/coach'
import { ContactLinks } from '../../components/ContactLinks'
import { BodyCompositionView } from '../../components/BodyCompositionView'
import { Sheet } from '../../components/Sheet'
import { ClientNutritionReview } from '../../components/ClientNutritionReview'
import { ClientReports, isOverdue } from '../../components/ClientReports'
import { pendingByTarget, tasksOf, weekProgress } from '../../db/reports'
import { ChatThread } from '../../components/ChatThread'
import { ClientWorkouts } from '../../components/ClientWorkouts'
import { IconBack, IconCheck, IconChevronRight } from '../../components/Icons'
import { formatDate, plural, startOfDay } from '../../lib/calc'
import { useApp } from '../../store/app'
import { t } from '../../lib/i18n'

/**
 * Разделы карточки клиента. Порядок из пункта 5.1 спецификации: профиль,
 * прогресс, питание, тренировки, чат. Дальше — то, чего в спецификации нет,
 * но что тренеру нужно: разбор отчётов, состав тела и приватные заметки.
 *
 * Список вынесен из разметки, потому что по нему же проверяется параметр
 * ?tab= из адреса: две копии перечня разошлись бы при первой же правке, и
 * ссылка на несуществующий раздел молча открывала бы «Профиль».
 */
const TABS = [
  ['overview', 'Профиль'],
  ['history', 'Тренировки'],
  ['nutrition', 'Питание'],
  ['reports', 'Отчёты'],
  ['body', 'Тело'],
  ['chat', 'Чат'],
] as const

type Tab = (typeof TABS)[number][0]

export function TrainerClientDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast, userId } = useApp()
  // Из списка клиентов можно попасть сразу к назначению программы или в чат.
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const asked = params.get('tab')
    return TABS.some(([key]) => key === asked) ? (asked as Tab) : 'overview'
  })
  const [assignOpen, setAssignOpen] = useState(params.get('assign') === '1')

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

  if (!detail) return <div className="screen">{t('Загрузка…')}</div>

  const { client } = detail

  const unlink = async () => {
    if (!link) return
    await removeLink(link.id)
    toast('Работа с клиентом завершена')
    nav('/trainer', { replace: true })
  }

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{client.name}</h1>
          <div className="sub">
            {client.experience ?? t('опыт не указан')}
            {client.height_cm ? ` · ${client.height_cm} см` : ''}
          </div>
        </div>
      </div>

      <div className="chips">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`chip${tab === key ? ' active' : ''}`}
            onClick={() => {
              setTab(key)
              // Адрес не должен спорить с тем, что открыто: иначе возврат на
              // эту страницу снова выкидывал бы в чат, из которого ушли.
              if (params.get('tab')) setParams({}, { replace: true })
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="section-title">{t('Режим работы')}</div>
          <div className="card">
            <div className="chips">
              {(
                [
                  ['online', t('Онлайн')],
                  ['offline', t('Очно')],
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

          <div className="section-title">{t('Оплата')}</div>
          <PaymentCard link={link ?? null} onToast={toast} />

          {/* Что выдано, но не сделано или не разобрано — единственное на
              экране, что требует действия прямо сейчас. */}
          <div className="section-title">{t('Требует внимания')}</div>
          <OutstandingCard
            clientId={id}
            onOpenTasks={() => setTab('reports')}
            onOpenWorkouts={() => setTab('history')}
            onOpenNutrition={() => setTab('nutrition')}
          />

          <div className="section-title">{t('Неделя')}</div>
          <WeekCard clientId={id} />

          <div className="section-title">{t('Связь с клиентом')}</div>
          <div className="card">
            <ContactLinks
              profile={client}
              title={t('Написать')}
              emptyHint="Клиент не указал, где с ним связаться. Попросите заполнить это в профиле."
            />
          </div>

          <button className="btn ghost danger block mt-5" onClick={unlink}>
            {t('Прекратить работу с клиентом')}
          </button>
          <div className="mute-sm text-center mt-2">
            История тренировок останется у клиента, вы потеряете к ней доступ.
          </div>
        </>
      )}

      {tab === 'body' && (
        <div className="mt-1">
          {/* Отдельного графика веса здесь нет: он уже внутри разбора, в
              блоке «Динамика», и там его можно переключить на любую другую
              метрику или сравнить две. Второй график показывал бы то же
              самое, но хуже. */}
          <BodyCompositionView userId={id} subject="client" />
        </div>
      )}

      {tab === 'history' && <ClientWorkouts clientId={id} onAssign={() => setAssignOpen(true)} />}

      {/* Тот же разбор, что видит клиент: тренер должен смотреть на те же
          цифры, иначе они спорят о разных отчётах. */}

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

      {tab === 'nutrition' && <ClientNutritionReview clientId={id} />}


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


    </div>
  )
}

/**
 * Насколько клиент держится недели: тренировки и дни дневника питания.
 *
 * Обе цифры — «сделано из плана», а не проценты: тренер разговаривает с
 * человеком числами, которые тот сам может пересчитать. План тренировок
 * берётся из назначения; если программы нет, показываем только факт —
 * делить на несуществующий план нечестно.
 */
function WeekCard({ clientId }: { clientId: string }) {
  const week = useLiveQuery(() => weekProgress(clientId), [clientId])
  if (!week) return <div className="card skeleton" style={{ height: 92 }} />

  const done = week.sessionsTarget != null && week.sessionsDone >= week.sessionsTarget

  return (
    <div className="card">
      <div className="row between">
        <span className="muted">{t('Тренировки')}</span>
        <span className="figures strong" style={{ color: done ? 'var(--ok)' : undefined }}>
          {week.sessionsTarget == null
            ? `${week.sessionsDone}`
            : `${week.sessionsDone} / ${week.sessionsTarget}`}
        </span>
      </div>
      {week.sessionsTarget == null && (
        <div className="mute-sm mt-1">{t('Программа не назначена — плана на неделю нет.')}</div>
      )}

      <div className="row between mt-3">
        <span className="muted">{t('дней по питанию сдано')}</span>
        <span className="figures strong">{week.nutritionDays} / 7</span>
      </div>
      <div className="mute-sm mt-1">{t('Считается с понедельника.')}</div>
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
  onOpenTasks,
  onOpenWorkouts,
  onOpenNutrition,
}: {
  clientId: string
  onOpenTasks: () => void
  onOpenWorkouts: () => void
  onOpenNutrition: () => void
}) {
  const tasks = useLiveQuery(() => tasksOf(clientId), [clientId])
  const pending = useLiveQuery(() => pendingByTarget(clientId), [clientId])

  if (tasks === undefined || pending === undefined) {
    return <div className="card skeleton" style={{ height: 84 }} />
  }

  const open = tasks.filter((x) => x.status === 'open')
  const overdue = open.filter(isOverdue).length
  const total = pending.workouts + pending.nutrition
  if (open.length === 0 && total === 0) {
    return <div className="card mute-sm">{t('Всё закрыто: заданий не висит, отчёты разобраны.')}</div>
  }

  const rows: { label: string; count: number; open: () => void; warn?: boolean }[] = [
    // Порядок по тому, чей ход: сначала то, что ждёт тренера, потом то,
    // что ждёт клиента. Иначе карточка «требует внимания» первым делом
    // показывает работу, которую тренер сделать не может.
    {
      label: t('Тренировки без разбора'),
      count: pending.workouts,
      open: onOpenWorkouts,
      warn: true,
    },
    {
      label: t('Дни питания без разбора'),
      count: pending.nutrition,
      open: onOpenNutrition,
      warn: true,
    },
    { label: t('Задания не выполнены'), count: open.length, open: onOpenTasks },
  ].filter((r) => r.count > 0)

  return (
    <div className="card">
      <div className="stack tight">
        {rows.map((r) => (
          <button className="row between" key={r.label} onClick={r.open}>
            <span className="muted" style={r.warn ? { color: 'var(--warn)' } : undefined}>
              {r.label}
            </span>
            <span className="row" style={{ gap: 6, flex: '0 0 auto' }}>
              <span className="figures strong" style={r.warn ? { color: 'var(--warn)' } : undefined}>
                {r.count}
              </span>
              <IconChevronRight size={15} />
            </span>
          </button>
        ))}
      </div>

      {overdue > 0 && (
        <div className="mute-sm mt-3" style={{ color: 'var(--danger)' }}>
          {overdue} {plural(overdue, ['задание', 'задания', 'заданий'])} {t('просрочено')}
        </div>
      )}
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

  if (!link) return <div className="card mute-sm">{t('Связь с клиентом не найдена.')}</div>

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
          <label htmlFor="paid-at">{t('Оплачено')}</label>
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
          <label htmlFor="next-payment">{t('Следующая оплата')}</label>
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
    } catch (e) {
      // Без подписки назначение не проходит — тренер должен увидеть почему,
      // а не форму, которая ничего не сделала и осталась открытой.
      toast(e instanceof Error ? e.message : 'Не удалось назначить программу')
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
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось создать программу')
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
            <label>{t('Дни недели')}</label>
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
            <label>{t('Сколько недель')}</label>
            <div className="segmented">
              {[4, 6, 8, 12].map((v) => (
                <button key={v} className={weeks === v ? 'on' : ''} onClick={() => setWeeks(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t('Комментарий клиенту')}</label>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('Например: первые две недели работаем в лёгком темпе')}
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
            <label>{t('Название')}</label>
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

