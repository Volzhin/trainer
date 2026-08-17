import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  freshAchievements,
  loadGame,
  loadTrainerGame,
  rememberAchievements,
  type GameState,
  type Achievement,
  type TrainerGameState,
} from '../db/game'
import {
  IconCamera,
  IconChart,
  IconCheck,
  IconClipboard,
  IconDumbbell,
  IconList,
  IconMuscle,
  IconRecord,
  IconTimer,
  IconUsers,
  IconZap,
} from './Icons'
import { Sheet } from './Sheet'
import { plural } from '../lib/calc'
import { haptics } from '../lib/native'
import { decimal, t } from '../lib/i18n'

/**
 * Счёт работы на экране: неделя, серия, итоги, достижения.
 *
 * Всё считается из тренировок, замеров и заданий, которые и так лежат в
 * базе (`db/game.ts`), поэтому здесь только показ. Один вход в данные на
 * весь экран — `useGame()`: раньше каждая карточка ходила бы за своим,
 * перечитывая одну и ту же таблицу тренировок по четыре раза.
 */
export function useGame(userId: string) {
  return useLiveQuery(() => loadGame(userId), [userId])
}

/* --------------------------- кольцо недели ----------------------------- */

/**
 * Два кольца: план тренировок и дни дневника.
 *
 * Заполняются один раз при появлении и дальше стоят. Крутиться постоянно
 * им незачем — это итог, а не процесс.
 */
export function WeekRing({
  done,
  target,
  nutritionDays,
  size = 92,
}: {
  done: number
  target: number | null
  nutritionDays: number
  size?: number
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    // Кадр на отрисовку в исходном положении: без него браузер видит
    // сразу конечное значение, и заполнения не происходит вовсе.
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const r1 = size / 2 - 8
  const r2 = size / 2 - 19
  const len = (r: number) => 2 * Math.PI * r
  /*
   * Без назначенной программы внешнее кольцо не заполняется вовсе, а его
   * дорожка становится пунктирной — тем же пунктиром, каким нарисован день
   * отдыха. Замкнутое кольцо означает «план выполнен», и рисовать его там,
   * где плана нет, — значит хвалить за выполнение того, чего никто не
   * назначал. Сколько тренировок сделано, скажет число рядом.
   */
  const p1 = target ? Math.min(1, done / target) : 0
  const p2 = Math.min(1, nutritionDays / 7)

  const arc = (r: number, p: number) => ({
    strokeDasharray: len(r),
    strokeDashoffset: len(r) * (1 - (shown ? p : 0)),
  })

  return (
    <svg
      className="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${t('Тренировки')}: ${done}${target ? ` ${t('из')} ${target}` : ''}. ${t('Дневник питания')}: ${nutritionDays} ${t('из')} 7`}
    >
      <circle
        className={`track${target ? '' : ' dashed'}`}
        cx={size / 2}
        cy={size / 2}
        r={r1}
        strokeWidth="9"
      />
      <circle className="track" cx={size / 2} cy={size / 2} r={r2} strokeWidth="7" />
      <circle
        className="val"
        cx={size / 2}
        cy={size / 2}
        r={r1}
        strokeWidth="9"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={arc(r1, p1)}
      />
      <circle
        className="val nutri"
        cx={size / 2}
        cy={size / 2}
        r={r2}
        strokeWidth="7"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={arc(r2, p2)}
      />
    </svg>
  )
}

/*
 * Ряда «пн вт ср чт пт сб вс» здесь больше нет.
 *
 * Он показывал ту же неделю теми же днями, что и календарь сразу под
 * карточкой, — и дни недели выходили на экране трижды подряд. Отметки о
 * проведённых тренировках календарь ставит сам, так что вместе с рядом
 * ничего не потерялось, кроме повторения.
 */

/* -------------------------------- достижения --------------------------------- */

/** Значок достижениеа. Медный — только рекорд и отклик: то, чем гордятся. */
function AchievementIcon({ id, size = 18 }: { id: string; size?: number }) {
  switch (id) {
    case 'inbody':
      return <IconChart size={size} />
    case 'measures4':
      return <IconTimer size={size} />
    case 'photos':
      return <IconCamera size={size} />
    case 'pr5':
      return <IconRecord size={size} />
    case 'ton100':
      return <IconMuscle size={size} />
    case 'month-plan':
    case 'month-clean':
      return <IconCheck size={size} />
    /* --- достижения тренера --- */
    case 'first-client':
    case 'clients5':
      return <IconUsers size={size} />
    case 'reviews10':
    case 'reviews100':
      return <IconClipboard size={size} />
    case 'own-program':
      return <IconList size={size} />
    case 'fast':
      return <IconZap size={size} />
    default:
      return <IconDumbbell size={size} />
  }
}

export function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  const [open, setOpen] = useState<Achievement | null>(null)

  return (
    <>
      <div className="achievements rise-list">
        {achievements.map((m, i) => (
          /* Плитка нажимается: без объяснения достижение читается как украшение —
             непонятно, что он значит и что нужно сделать, чтобы получить
             следующий. Текст открывается листом, а не живёт в плитке: в
             сетке по три в ряд он туда не поместится. */
          <button
            key={m.id}
            className={`achievement${m.done ? '' : ' locked'}${m.copper ? ' copper' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => setOpen(m)}
          >
            <span className="glyph">
              <AchievementIcon id={m.id} />
            </span>
            <span className="cap">{t(m.title)}</span>
            {/* У полученного цифры не нужны: «5 из 5» под ним читается как
                незакрытый долг. */}
            {!m.done && (
              <span className="mute-sm figures" style={{ display: 'block', marginTop: 4 }}>
                {shortCount(m.have)} / {shortCount(m.need)}
              </span>
            )}
          </button>
        ))}
      </div>

      <AchievementSheet achievement={open} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * Что означает достижение и как оно считается.
 *
 * Отдельным листом, потому что объяснение должно быть полным: короткая
 * подпись в плитке отвечает «что это», но не «за что» и не «сколько
 * осталось». Полученное показывает, чем заслужено; неполученное — сколько
 * не хватает и что для этого сделать.
 */
function AchievementSheet({ achievement, onClose }: { achievement: Achievement | null; onClose: () => void }) {
  if (!achievement) return null

  const left = achievement.need - achievement.have

  return (
    <Sheet open={!!achievement} title={t(achievement.title)} onClose={onClose}>
      <div className="row" style={{ gap: 14 }}>
        <span
          className={`glyph-inline${achievement.copper ? ' copper' : ''}`}
          style={{ width: 48, height: 48, opacity: achievement.done ? 1 : 0.5 }}
        >
          <AchievementIcon id={achievement.id} size={22} />
        </span>
        <span className="grow">
          <span className="strong">{achievement.done ? t('Получено') : t('Ещё не получено')}</span>
          <span className="sub">{t(achievement.hint)}</span>
        </span>
      </div>

      <div className="muted mt-4">{t(achievement.what)}</div>

      {/* Полоса только у неполученного: у выданного она всегда полная и
          говорить ей нечего. */}
      {!achievement.done && (
        <div className="mt-4">
          <div className="row between mb-2">
            <span className="mute-sm">{t('Осталось')}</span>
            <span className="figures strong">{shortCount(left)}</span>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.round((achievement.have / achievement.need) * 100)}%` }} />
          </div>
          <div className="mute-sm mt-2">
            {shortCount(achievement.have)} {t('из')} {shortCount(achievement.need)}
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Сто тысяч килограммов — это «100 т», а не пятизначное число в плитке. */
const shortCount = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}т` : String(n))

/* -------------------------------- всего ---------------------------------- */

/**
 * Накопленное — тремя простыми числами.
 *
 * На этом месте была «ступень» с названиями вроде «База» и «Ритм» и номером
 * рядом. Она ничего не сообщала: слово не говорит ни сколько сделано, ни
 * сколько осталось. Число тренировок, поднятые тонны и стаж понятны без
 * подписи, а ощущение пути дают достижения — у них есть и порог, и текст,
 * за что они выдаются.
 */
export function TotalsCard({
  items,
}: {
  items: {
    value: number
    /** Подпись без склонения — когда число её не меняет («поднято»). */
    label?: string
    /** Три формы для склонения по числу: 1 тренировка, 2 тренировки, 5 тренировок. */
    forms?: [string, string, string]
    decimals?: number
    suffix?: string
  }[]
}) {
  return (
    <div className="stat-grid three fade-in">
      {items.map((it, i) => (
        <div className="stat" key={it.label ?? it.forms?.[0] ?? i}>
          <div className="value figures">
            <Counter value={it.value} decimals={it.decimals} />
            {it.suffix ? <span className="mute-sm"> {t(it.suffix)}</span> : null}
          </div>
          {/* Подпись склоняется по числу: «1 тренировок» выдаёт машину
              с головой, а не человека, который это считал. */}
          <div className="label">
            {it.forms ? plural(Math.round(it.value), it.forms) : t(it.label ?? '')}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------- год одной строкой -------------------------- */

/**
 * Пятьдесят две недели подряд, столбик на неделю.
 *
 * Отвечает на вопрос, которого нет ни на одном графике: «как давно я этим
 * занимаюсь и где провалился». Провалы не окрашены тревожно — они просто
 * пустые: смысл полосы в том, чтобы человек увидел путь целиком, а не
 * получил список упрёков.
 */
export function YearStrip({ year }: { year: { weekStart: number; sessions: number }[] }) {
  return (
    <div className="year-strip" role="img" aria-label={t('Тренировки по неделям за год')}>
      {year.map((w) => (
        <i
          key={w.weekStart}
          className={w.sessions >= 3 ? 'w3' : w.sessions === 2 ? 'w2' : w.sessions === 1 ? 'w1' : ''}
        />
      ))}
    </div>
  )
}

/* --------------------------- карточка на главной ------------------------- */

/**
 * Неделя, серия и ближайшее достижение — одной карточкой на главной.
 *
 * Единица счёта здесь неделя, а не день: план тренер выдаёт на неделю, и
 * «2 из 3» человек может пересчитать сам. Ежедневная галочка заставляла бы
 * открывать приложение ради галочки — это игра вместо работы.
 */
export function WeekCard({ game }: { game: GameState }) {
  const { week, streak, next } = game
  const enough = week.target != null && week.done >= week.target

  return (
    /* Мягкое проявление вместо скачка: карточка приходит из базы, а не
       стоит на экране изначально, и подмена заглушки данными рывком
       читается как сбой отрисовки. */
    <div className="card fade-in">
      <div className="ring-wrap">
        <WeekRing done={week.done} target={week.target} nutritionDays={week.nutritionDays} />
        <div className="grow">
          <div className="row between">
            <span className="muted">{t('Тренировки')}</span>
            <span
              className="figures strong"
              style={{ color: enough ? 'var(--ok)' : undefined }}
            >
              {week.target == null ? week.done : `${week.done} / ${week.target}`}
            </span>
          </div>
          <div className="row between mt-1">
            <span className="muted">{t('Дневник')}</span>
            <span className="figures strong" style={{ color: 'var(--info)' }}>
              {week.nutritionDays} / 7
            </span>
          </div>
          {week.target == null && (
            <div className="mute-sm mt-1">{t('Программа не назначена — плана на неделю нет.')}</div>
          )}
        </div>
      </div>

      {/* Серия появляется со второй недели: «1 неделя подряд» — это не
          серия, а просто неделя, и хвастаться ею перед человеком нечестно. */}
      {streak.weeks >= 2 && (
        <div className="row between mt-4">
          <span className="muted">{t('Серия')}</span>
          <span className="badge pro">
            {streak.weeks} {plural(streak.weeks, ['неделя', 'недели', 'недель'])} {t('подряд')}
          </span>
        </div>
      )}
      {streak.paused && (
        <div className="mute-sm mt-1">
          {t('Пропущенная неделя серию не обнуляет — она ждёт вас на том же счёте.')}
        </div>
      )}

      {/* Ближайшее достижение — ровно одно. Витрина из десятка серых значков
          демотивирует, один достижимый — наоборот. */}
      {next && (
        <div className="row mt-4" style={{ gap: 12 }}>
          <span className={`glyph-inline${next.copper ? ' copper' : ''}`}>
            <AchievementIcon id={next.id} size={17} />
          </span>
          <span className="grow">
            <span className="strong">{t(next.title)}</span>
            <span className="sub">
              {t('осталось')} {shortCount(next.need - next.have)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- счёт работы тренера ------------------------ */

export function useTrainerGame(trainerId: string) {
  return useLiveQuery(() => loadTrainerGame(trainerId), [trainerId])
}

/** Часы человеческим языком: «6 ч», «2 дня», а не «51.4». */
function hoursText(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} ${t('мин')}`
  if (h < 48) return `${Math.round(h)} ${t('ч')}`
  const days = Math.round(h / 24)
  return `${days} ${plural(days, ['день', 'дня', 'дней'])}`
}

/**
 * Неделя тренера.
 *
 * Тот же счёт, что у клиента, но на языке его дела: не «сколько я
 * потренировался», а «сколько разобрал, сколько должен и как быстро
 * отвечаю». Очков здесь нет и быть не может — тренер работает, а не
 * играет; всё, что показано, он и так обязан знать про свою практику.
 */
export function TrainerWeekCard({ game }: { game: TrainerGameState }) {
  const { week, streak, responseHours, next } = game
  const clear = week.pending === 0

  return (
    <div className="card fade-in">
      <div className="stat-grid three">
        <div className="stat">
          <div className="value figures">
            <Counter value={week.reviewed} />
          </div>
          <div className="label">{t('разобрано за неделю')}</div>
        </div>
        <div className="stat">
          {/* Ноль подсвечен — это «всё закрыто», главная хорошая новость
              недели. Долг жёлтым, как непроверенный отчёт в календаре. */}
          <div
            className="value figures"
            style={{ color: clear ? 'var(--ok)' : 'var(--warn)' }}
          >
            {week.pending}
          </div>
          <div className="label">{t('ждут разбора')}</div>
        </div>
        <div className="stat">
          <div className="value figures">
            {week.onPlan} / {week.clients}
          </div>
          <div className="label">{t('держат план')}</div>
        </div>
      </div>

      {/* Отклик — единственная цифра, которая говорит о качестве работы, а
          не о её количестве: отчёт, разобранный через неделю, клиент уже
          не помнит. Пока разбирать было нечего, цифру не выдумываем. */}
      <div className="row between mt-4">
        <span className="muted">{t('Отклик')}</span>
        <span className="figures strong">
          {responseHours == null ? t('пока не о чем') : hoursText(responseHours)}
        </span>
      </div>
      {responseHours != null && (
        <div className="mute-sm mt-1">{t('Столько в среднем проходит от сдачи до разбора.')}</div>
      )}

      {streak.weeks >= 2 && (
        <div className="row between mt-4">
          <span className="muted">{t('Недель без долгов')}</span>
          <span className="badge pro">
            {streak.weeks} {plural(streak.weeks, ['неделя', 'недели', 'недель'])} {t('подряд')}
          </span>
        </div>
      )}
      {streak.paused && (
        <div className="mute-sm mt-1">
          {t('Неделя без отчётов счёт не рвёт — разбирать было нечего.')}
        </div>
      )}

      {next && (
        <div className="row mt-4" style={{ gap: 12 }}>
          <span className={`glyph-inline${next.copper ? ' copper' : ''}`}>
            <AchievementIcon id={next.id} size={17} />
          </span>
          <span className="grow">
            <span className="strong">{t(next.title)}</span>
            <span className="sub">
              {t('осталось')} {shortCount(next.need - next.have)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/* --------------------------- момент выдачи достижениеа ------------------------- */

/**
 * Новое достижение — короткое поздравление там, где человек его увидит.
 *
 * Ни модального окна поверх экрана, ни конфетти, ни звука: одно движение и
 * строка текста. Достижение выдаётся один раз, отметка о показе живёт на
 * устройстве, и повторно приложение об этом не заговорит.
 */
export function NewAchievementCard({ achievements, userId }: { achievements: Achievement[]; userId?: string }) {
  const [fresh, setFresh] = useState<Achievement[]>([])
  // Отметку ставим сразу, как показали: иначе перерисовка экрана
  // поздравляет второй раз, и «один раз» превращается в мигание.
  const claimed = useRef(false)

  useEffect(() => {
    if (claimed.current || !achievements.length) return
    claimed.current = true
    void freshAchievements(achievements, userId).then((got) => {
      if (!got.length) return
      // Больше двух разом — это не сегодняшняя работа, а приехавшая
      // история: человек вошёл на новом устройстве, и обмен привёз ему
      // полгода тренировок. Поздравлять шестью достижениеами подряд за то, что
      // он уже давно сделал, — значит обесценить каждый. Отмечаем молча.
      if (got.length <= 2) {
        setFresh(got)
        haptics.success()
      }
      void rememberAchievements(got.map((m) => m.id), userId)
    })
    /*
     * Отмены здесь нет намеренно, и это тот редкий случай, когда она вредна.
     * В строгом режиме React выполняет эффект дважды — с размонтированием
     * между заходами, — и флаг «жив ли ещё» гасил ответ первого захода
     * целиком: достижение не показывался и, что хуже, не отмечался показанным.
     * Ставить состояние размонтированному компоненту React 18 разрешает,
     * это пустая операция; повторный заход отсекает claimed.
     */
  }, [achievements.length])

  if (!fresh.length) return null

  return (
    <div className="card pop-in mb-4" style={{ borderColor: 'var(--accent)' }}>
      <div className="mute-sm">{t('Новое достижение')}</div>
      {fresh.map((m) => (
        <div className="row mt-3" key={m.id} style={{ gap: 12 }}>
          <span
            className={`glyph-inline${m.copper ? ' copper' : ''}`}
            style={{ position: 'relative' }}
          >
            <AchievementIcon id={m.id} size={17} />
            <span className={`flare${m.copper ? '' : ' accent'}`} />
          </span>
          <span className="grow">
            <span className="strong">{t(m.title)}</span>
            <span className="sub">{t(m.hint)}</span>
          </span>
        </div>
      ))}
      <button className="btn block mt-3" onClick={() => setFresh([])}>
        {t('Понятно')}
      </button>
    </div>
  )
}

/* ------------------------------ число досчитывает ------------------------ */

/**
 * Число, которое досчитывает до значения.
 *
 * Только для итогов — недельных и общих. В живой тренировке такого нет
 * намеренно: там цифра нужна сразу и точная, а не через 700 мс.
 *
 * Системную настройку «уменьшить движение» проверяем сами: она гасит CSS,
 * но не таймер, и человек, попросивший тишины, всё равно смотрел бы на
 * бегущие цифры.
 */
export function Counter({
  value,
  decimals = 0,
  suffix,
}: {
  value: number
  decimals?: number
  suffix?: ReactNode
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    from.current = value
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(a + (value - a) * eased)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <>
      {/* Разделитель дробной части берём из языка: «76,8» по-русски и
          «76.8» по-английски — toFixed знает только точку. */}
      {decimal(shown.toFixed(decimals))}
      {suffix}
    </>
  )
}
