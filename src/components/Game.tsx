import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  STAGES,
  freshMarks,
  loadGame,
  rememberMarks,
  type GameState,
  type Mark,
} from '../db/game'
import {
  IconCamera,
  IconCheck,
  IconChart,
  IconDumbbell,
  IconRecord,
  IconTimer,
  IconMuscle,
} from './Icons'
import { plural } from '../lib/calc'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Счёт работы на экране: неделя, серия, ступень, знаки.
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

/* ---------------------------- неделя точками ---------------------------- */

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function WeekDots({ days }: { days: boolean[] }) {
  // Понедельник — нулевой день недели в нашей сетке, воскресенье — шестой.
  const today = (new Date().getDay() + 6) % 7
  return (
    <div className="week-dots">
      {WEEKDAYS.map((label, i) => (
        <i
          key={label}
          className={`${days[i] ? 'on' : ''}${i === today ? ' today' : ''}`}
          style={{ '--i': i } as React.CSSProperties}
        >
          {t(label)}
        </i>
      ))}
    </div>
  )
}

/* ------------------------------- ступень -------------------------------- */

/**
 * Ступень нарисована грифом с дисками: сколько ступеней пройдено, столько
 * дисков висит. Знак из зала, а не из игры — читается без подписи.
 *
 * По нажатию диски проворачиваются. Это единственное движение в
 * приложении, которое ничего не сообщает, и оно тут намеренно: одна
 * пасхалка на всё приложение, которую находят руками.
 */
export function StageBar({ index }: { index: number }) {
  const [spin, setSpin] = useState(false)
  const plates = STAGES.map((_, i) => i <= index)

  return (
    <button
      className={`barbell${spin ? ' spin' : ''}`}
      style={{ width: '100%', background: 'none', border: 0, padding: 0 }}
      aria-label={t('Ступень')}
      onClick={() => {
        if (spin) return
        haptics.selection()
        setSpin(true)
        setTimeout(() => setSpin(false), 900)
      }}
    >
      {[...plates].reverse().map((filled, i) => (
        <span
          key={`l${i}`}
          className={`plate${filled ? '' : ' blank'}`}
          style={{ height: 12 + (plates.length - i) * 5 }}
        />
      ))}
      <span className="bar-line" />
      {plates.map((filled, i) => (
        <span
          key={`r${i}`}
          className={`plate${filled ? '' : ' blank'}`}
          style={{ height: 12 + (plates.length - i) * 5 }}
        />
      ))}
    </button>
  )
}

/* -------------------------------- знаки --------------------------------- */

/** Значок знака. Медный — только рекорды, второй цветовой голос системы. */
function MarkIcon({ id, size = 18 }: { id: string; size?: number }) {
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
      return <IconCheck size={size} />
    default:
      return <IconDumbbell size={size} />
  }
}

export function MarksGrid({ marks }: { marks: Mark[] }) {
  return (
    <div className="marks rise-list">
      {marks.map((m, i) => (
        <div
          key={m.id}
          className={`mark${m.done ? '' : ' locked'}${m.copper ? ' copper' : ''}`}
          style={{ '--i': i } as React.CSSProperties}
        >
          <span className="glyph">
            <MarkIcon id={m.id} />
          </span>
          <div className="cap">{t(m.title)}</div>
          {/* У выданного знака цифры не нужны: он уже получен, и «5 из 5»
              под ним читается как незакрытый долг. */}
          {!m.done && (
            <div className="mute-sm figures" style={{ marginTop: 4 }}>
              {shortCount(m.have)} / {shortCount(m.need)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Сто тысяч килограммов — это «100 т», а не пятизначное число в плитке. */
const shortCount = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}т` : String(n))

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
 * Неделя, серия и ближайший знак — одной карточкой на главной.
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

      <div className="mt-4">
        <WeekDots days={week.days} />
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

      {/* Ближайший знак — ровно один. Витрина из десятка серых значков
          демотивирует, один достижимый — наоборот. */}
      {next && (
        <div className="row mt-4" style={{ gap: 12 }}>
          <span className={`glyph-inline${next.copper ? ' copper' : ''}`}>
            <MarkIcon id={next.id} size={17} />
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

/* --------------------------- момент выдачи знака ------------------------- */

/**
 * Новый знак — короткое поздравление там, где человек его увидит.
 *
 * Ни модального окна поверх экрана, ни конфетти, ни звука: одно движение и
 * строка текста. Знак выдаётся один раз, отметка о показе живёт на
 * устройстве, и повторно приложение об этом не заговорит.
 */
export function NewMarkCard({ marks }: { marks: Mark[] }) {
  const [fresh, setFresh] = useState<Mark[]>([])
  // Отметку ставим сразу, как показали: иначе перерисовка экрана
  // поздравляет второй раз, и «один раз» превращается в мигание.
  const claimed = useRef(false)

  useEffect(() => {
    if (claimed.current || !marks.length) return
    claimed.current = true
    void freshMarks(marks).then((got) => {
      if (!got.length) return
      // Больше двух разом — это не сегодняшняя работа, а приехавшая
      // история: человек вошёл на новом устройстве, и обмен привёз ему
      // полгода тренировок. Поздравлять шестью знаками подряд за то, что
      // он уже давно сделал, — значит обесценить каждый. Отмечаем молча.
      if (got.length <= 2) {
        setFresh(got)
        haptics.success()
      }
      void rememberMarks(got.map((m) => m.id))
    })
    /*
     * Отмены здесь нет намеренно, и это тот редкий случай, когда она вредна.
     * В строгом режиме React выполняет эффект дважды — с размонтированием
     * между заходами, — и флаг «жив ли ещё» гасил ответ первого захода
     * целиком: знак не показывался и, что хуже, не отмечался показанным.
     * Ставить состояние размонтированному компоненту React 18 разрешает,
     * это пустая операция; повторный заход отсекает claimed.
     */
  }, [marks.length])

  if (!fresh.length) return null

  return (
    <div className="card pop-in mb-4" style={{ borderColor: 'var(--accent)' }}>
      <div className="mute-sm">{t('Новый знак')}</div>
      {fresh.map((m) => (
        <div className="row mt-3" key={m.id} style={{ gap: 12 }}>
          <span
            className={`glyph-inline${m.copper ? ' copper' : ''}`}
            style={{ position: 'relative' }}
          >
            <MarkIcon id={m.id} size={17} />
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
      {shown.toFixed(decimals)}
      {suffix}
    </>
  )
}
