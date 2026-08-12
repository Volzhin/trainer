import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyMetric } from '../db/db'
import {
  deleteAllBodyMetrics,
  deleteBodyMetric,
  listBodyMetrics,
  saveInBodyReport,
  saveManualMeasurement,
} from '../db/repo'
import { parseInBodyPdf, statusFor, type InBodyReport, type NormStatus } from '../lib/inbody'
import { LineChart } from './LineChart'
import { BodyDonut, useCountUp, type DonutPart } from './BodyDonut'
import { BodySegmentsFigure } from './BodySegmentsFigure'
import {
  IcoApple,
  IcoBmi,
  IcoBone,
  IcoFat,
  IcoFlame,
  IcoLean,
  IcoMuscle,
  IcoProtein,
  IcoTarget,
  IcoVisceral,
  IcoWater,
  IcoWeight,
} from './MetricIcons'
import { Sheet } from './Sheet'
import { IconTrash } from './Icons'
import { formatDate, plural } from '../lib/calc'
import { BODY_FAT_RANGE, deriveComposition } from '../lib/anthropometry'
import { getNutritionProfile } from '../db/nutrition'
import { macroTargets, MACRO_PRESETS } from '../lib/tdee'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

// Цвета берём из токенов: они подобраны отдельно для светлой и тёмной темы.
export const BODY_C = {
  muscle: 'var(--c-muscle)',
  protein: 'var(--c-protein)',
  minerals: 'var(--c-minerals)',
  water: 'var(--c-water)',
  fat: 'var(--c-fat)',
  neutral: 'var(--text-2)',
}

const C = BODY_C

/** Итог разбора одного файла: либо отчёт, либо причина отказа. */
type Parsed = { fileName: string; report?: InBodyReport; error?: string }

const STATUS_TEXT: Record<NormStatus, string> = {
  low: 'Ниже нормы',
  normal: 'Норма',
  high: 'Выше нормы',
}

/** Метрика экрана: как достать значение, как подписать и каким цветом. */
type Row = {
  key: keyof BodyMetric
  label: string
  unit: string
  color: string
  Icon: (p: { size?: number; color?: string }) => JSX.Element
  /** Куда «лучше» двигаться — для окраски дельты. */
  better?: 'up' | 'down'
}

const MAIN: Row[] = [
  {
    key: 'weight_kg',
    label: 'Вес',
    unit: 'кг',
    color: C.muscle,
    Icon: IcoWeight,
    better: 'down',
  },
  { key: 'body_fat_pct', label: 'Жир', unit: '%', color: C.fat, Icon: IcoFat, better: 'down' },
  {
    key: 'skeletal_muscle_kg',
    label: 'Мышцы',
    unit: 'кг',
    color: C.muscle,
    Icon: IcoMuscle,
    better: 'up',
  },
  {
    key: 'body_water_l',
    label: 'Вода',
    unit: 'л',
    color: C.water,
    Icon: IcoWater,
    better: 'up',
  },
  {
    key: 'protein_kg',
    label: 'Белок',
    unit: 'кг',
    color: C.protein,
    Icon: IcoProtein,
    better: 'up',
  },
  {
    key: 'minerals_kg',
    label: 'Минералы',
    unit: 'кг',
    color: C.minerals,
    Icon: IcoBone,
    better: 'up',
  },
]

const OTHER: Row[] = [
  {
    key: 'visceral_fat',
    label: 'Висцеральный жир',
    unit: '',
    color: C.fat,
    Icon: IcoVisceral,
    better: 'down',
  },
  { key: 'bmi', label: 'ИМТ', unit: '', color: C.neutral, Icon: IcoBmi, better: 'down' },
  {
    key: 'fat_free_mass_kg',
    label: 'Безжировая масса',
    unit: 'кг',
    color: C.muscle,
    Icon: IcoLean,
    better: 'up',
  },
  {
    key: 'bmr_kcal',
    label: 'Основной обмен веществ',
    unit: 'ккал',
    color: C.protein,
    Icon: IcoFlame,
    better: 'up',
  },
]

const TRACKABLE = [...MAIN, ...OTHER]

/**
 * Что означает метрика и от чего она движется. Отчёт печатает голое число и
 * пометку «выше нормы» — по ней не понять ни что мерили, ни что с этим
 * делать. Формулировки описательные: это разбор показателя, а не назначения.
 */
const METRIC_INFO: Partial<Record<keyof BodyMetric, { what: string; affects: string[] }>> = {
  weight_kg: {
    what: 'Общая масса тела: мышцы, жир, кости, вода и всё остальное. Сам по себе вес не говорит, из чего он состоит, — за этим смотрят на жир и мышцы.',
    affects: [
      'Соотношение мышц и жира',
      'Количество воды в организме',
      'Питание и уровень физической активности',
    ],
  },
  body_fat_pct: {
    what: 'Доля жировой массы в общем весе. Меняется медленнее веса: вес скачет от воды и содержимого кишечника, процент жира — нет.',
    affects: [
      'Баланс калорий: сколько получено против потрачено',
      'Силовые нагрузки — они удерживают мышцы, пока уходит жир',
      'Сон и уровень стресса',
    ],
  },
  skeletal_muscle_kg: {
    what: 'Масса скелетных мышц — тех, которыми вы двигаете телом. Растёт медленно, месяцами, и заметнее всего в начале тренировок.',
    affects: [
      'Регулярные силовые тренировки и рост нагрузки',
      'Достаточность белка в рационе',
      'Восстановление и сон',
    ],
  },
  body_water_l: {
    what: 'Общая вода в организме: внутри клеток и между ними. Сильнее прочих метрик пляшет ото дня ко дню.',
    affects: [
      'Сколько выпито за сутки',
      'Соль и углеводы в рационе',
      'Время суток и недавняя тренировка',
    ],
  },
  protein_kg: {
    what: 'Белок в составе тела — прежде всего в мышцах и органах. Идёт рука об руку с мышечной массой.',
    affects: ['Белок в рационе', 'Силовые нагрузки', 'Общая калорийность питания'],
  },
  minerals_kg: {
    what: 'Минеральные вещества: в основном костная ткань, немного — в крови и тканях. Меняется очень медленно.',
    affects: ['Кальций, фосфор и витамин D в рационе', 'Силовые и ударные нагрузки', 'Возраст'],
  },
  visceral_fat: {
    what: 'Жир вокруг внутренних органов в брюшной полости — в отличие от подкожного, снаружи его не видно и не прощупать.',
    affects: ['Общее количество жира в теле', 'Питание и режим сна', 'Регулярность нагрузок'],
  },
  bmi: {
    what: 'Индекс массы тела: вес относительно роста в квадрате. Состав тела он не различает — у мускулистого человека выходит высоким без лишнего жира.',
    affects: ['Вес', 'Рост'],
  },
  fat_free_mass_kg: {
    what: 'Всё, кроме жира: мышцы, кости, органы и вода. Её и стараются сохранить, когда снижают вес.',
    affects: ['Силовые нагрузки', 'Белок в рационе', 'Скорость снижения веса'],
  },
  bmr_kcal: {
    what: 'Сколько энергии тело тратит в полном покое — на дыхание, сердцебиение и обмен веществ. Это не суточная норма: сверху добавляются движение и тренировки.',
    affects: ['Безжировая масса', 'Возраст и пол', 'Длительное недоедание'],
  },
}

/** Массы состава, которые осмысленно показывать ещё и долей от веса. */
const AS_SHARE: (keyof BodyMetric)[] = [
  'skeletal_muscle_kg',
  'fat_free_mass_kg',
  'protein_kg',
  'minerals_kg',
  'body_water_l',
]

/**
 * Показания точки: слева доля в процентах, справа абсолютное значение —
 * и так у каждой метрики. Видеть «18 %» и не знать, сколько это в
 * килограммах, неудобно: по одному проценту не понять, ушёл жир или просто
 * прибавились мышцы. А общие столбцы позволяют сравнивать ряды взглядом,
 * не разбирая каждый заново.
 */
function cellsFor(m: BodyMetric, key: keyof BodyMetric, unit: string): (string | null)[] {
  const v = m[key]
  if (typeof v !== 'number') return []
  const abs = unit ? `${round1(v)} ${unit}` : String(round1(v))

  if (key === 'body_fat_pct') {
    return [`${round1(v)} %`, m.body_fat_kg != null ? `${round1(m.body_fat_kg)} кг` : null]
  }
  if (AS_SHARE.includes(key)) {
    return [m.weight_kg ? `${round1((v / m.weight_kg) * 100)} %` : null, abs]
  }
  // Вес, ИМТ, висцеральный жир: доли от веса у них нет по смыслу.
  return [null, abs]
}

/** Чей состав тела смотрим: от этого зависят только формулировки. */
export type BodySubject = 'self' | 'client'

const TEXT = {
  self: {
    emptyTitle: 'Сделайте первый замер',
    emptyHint:
      'Загрузите PDF из DDX Fitness или распечатку InBody — разберём состав, нормы и сегментарный анализ. Нет отчёта — введите вес и обхваты руками, состав посчитается по ним.',
    uploadFirst: 'Загрузить отчёт InBody',
    uploadMore: 'Загрузить новый замер',
    privacy: 'Файл никуда не отправляется — разбор идёт прямо на устройстве.',
  },
  client: {
    emptyTitle: 'Замеров пока нет',
    emptyHint:
      'Клиент может загрузить отчёт сам — или загрузите его PDF здесь: состав, нормы и сегментарный анализ появятся и в приложении клиента.',
    uploadFirst: 'Загрузить отчёт клиента',
    uploadMore: 'Загрузить новый замер клиента',
    privacy: 'Файл никуда не отправляется — разбор идёт прямо на устройстве.',
  },
}

/**
 * Тело экрана «Анализ тела» без шапки: один и тот же разбор показывается
 * клиенту про себя и тренеру — про каждого клиента.
 */
export function BodyCompositionView({
  userId,
  subject = 'self',
}: {
  userId: string
  subject?: BodySubject
}) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const t = TEXT[subject]

  const [pending, setPending] = useState<Parsed[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  // Отдельно от busy: иначе кнопка загрузки во время чистки пишет «Читаю отчёт…».
  const [wiping, setWiping] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [segTab, setSegTab] = useState<'muscle' | 'fat'>('muscle')
  // Одна или две метрики на графике. Раньше это были два отдельных состояния
  // и два почти одинаковых ряда чипов — по ним не читалось, чем второй ряд
  // отличается от первого, и половина экрана на телефоне уходила на выбор.
  const [trendKeys, setTrendKeys] = useState<(keyof BodyMetric)[]>(['weight_kg'])

  const toggleTrend = (key: keyof BodyMetric) =>
    setTrendKeys((prev) => {
      if (prev.includes(key)) {
        // Последнюю метрику снять нельзя — графику нечего будет рисовать.
        return prev.length === 1 ? prev : prev.filter((k) => k !== key)
      }
      // Когда выбраны две и жмут третью, меняем вторую: первая — точка
      // отсчёта, от неё и сравнивают.
      return prev.length < 2 ? [...prev, key] : [prev[0], key]
    })
  const [historyOpen, setHistoryOpen] = useState(false)
  // Какую метрику разбираем в шторке.
  const [infoRow, setInfoRow] = useState<Row | null>(null)

  const metrics = useLiveQuery(() => listBodyMetrics(userId), [userId], [] as BodyMetric[])
  /**
   * Раскладка макронутриентов берётся из раздела питания, а не задаётся здесь
   * заново: иначе два экрана советовали бы разное из одних и тех же калорий.
   * Коэффициенты тренера (coach_macros) сюда не годятся — они привязаны к его
   * целевой калорийности, а не к норме из отчёта.
   */
  const nutrition = useLiveQuery(() => getNutritionProfile(userId), [userId])

  // Замером считается любая запись: ручной ввод и импорт отчёта равноправны.
  // Раньше фильтр по источнику прятал ручные замеры, и экран сообщал, что
  // данных нет, одновременно рисуя по ним график.
  const scans = useMemo(
    () =>
      (metrics ?? [])
        .filter((m) => m.weight_kg != null || m.body_fat_pct != null)
        .sort((a, b) => b.logged_at - a.logged_at),
    [metrics],
  )
  const latest = scans[0]
  const previous = scans[1]

  /**
   * Свежее взвешивание часто содержит только вес: состав меряют реже.
   * Поэтому кольцо, нормы и сегменты берём из последнего замера, где эти
   * данные есть, и подписываем его дату — иначе разделы стоят пустыми,
   * хотя разбор в истории имеется.
   */
  const composed = useMemo(
    () => scans.find((m) => m.skeletal_muscle_kg != null || m.body_water_l != null),
    [scans],
  )
  const composedPrev = useMemo(
    () =>
      scans.filter(
        (m) => m !== composed && (m.skeletal_muscle_kg != null || m.body_water_l != null),
      )[0],
    [scans, composed],
  )
  const segmented = useMemo(() => scans.find((m) => m.muscle_segments), [scans])

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setBusy(true)
    setProgress({ done: 0, total: files.length })

    // Читаем по одному, а не через Promise.all: pdf.js держит документ в
    // памяти целиком, и пачка отчётов, разобранная разом, роняет вкладку на
    // телефоне. Заодно видно, на каком файле мы сейчас.
    const parsed: Parsed[] = []
    for (const file of files) {
      try {
        parsed.push({ fileName: file.name, report: await parseInBodyPdf(file) })
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Не удалось разобрать PDF'
        parsed.push({ fileName: file.name, error })
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    const ok = parsed.filter((x) => x.report)
    if (ok.length) {
      haptics.impact()
      setPending(parsed)
    } else {
      // Разбирать нечего — показываем причину, а не пустой лист подтверждения.
      // Общая причина у всей пачки (например, нераспознанная дата) полезнее
      // счёта файлов: по ней понятно, что делать дальше.
      const reasons = new Set(parsed.map((x) => x.error))
      toast(
        reasons.size === 1
          ? (parsed[0].error ?? 'Не удалось разобрать PDF')
          : 'Ни один файл разобрать не удалось',
      )
    }

    setBusy(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const confirmImport = async () => {
    const ready = (pending ?? []).filter(
      (x): x is Parsed & { report: InBodyReport } => !!x.report,
    )
    if (!ready.length) return
    setBusy(true)

    // По возрастанию даты: замер за один день перезаписывается, и при обратном
    // порядке из пачки за одну дату в базе оставался бы самый старый отчёт.
    const ordered = [...ready].sort((a, b) => a.report.measured_at - b.report.measured_at)
    let added = 0
    let replaced = 0
    for (const item of ordered) {
      const res = await saveInBodyReport(item.report, item.fileName, userId)
      if (res.replaced) replaced++
      else added++
    }

    haptics.success()
    setBusy(false)
    setPending(null)
    if (ordered.length === 1) {
      toast(replaced ? 'Замер за эту дату обновлён' : 'Замер добавлен')
    } else {
      const parts = [added && `добавлено ${added}`, replaced && `обновлено ${replaced}`]
      toast(parts.filter(Boolean).join(', '))
    }
  }

  const split = nutrition?.macro_split ?? MACRO_PRESETS.balanced.split
  const macros = latest?.daily_kcal != null ? macroTargets(latest.daily_kcal, split) : undefined

  const readyCount = (pending ?? []).filter((x) => x.report).length
  const failedCount = (pending ?? []).filter((x) => x.error).length
  /** Один файл показываем как раньше — со всеми метриками отчёта. */
  const single =
    pending && pending.length === 1 && pending[0].report
      ? (pending[0] as Parsed & { report: InBodyReport })
      : null

  const donutParts: DonutPart[] = composed
    ? ([
        {
          key: 'muscle',
          label: 'Мышцы',
          value: composed.skeletal_muscle_kg,
          unit: 'кг',
          color: C.muscle,
        },
        {
          key: 'protein',
          label: 'Белок',
          value: composed.protein_kg,
          unit: 'кг',
          color: C.protein,
        },
        {
          key: 'minerals',
          label: 'Минералы',
          value: composed.minerals_kg,
          unit: 'кг',
          color: C.minerals,
        },
        {
          key: 'water',
          label: 'Вода',
          value: composed.body_water_l,
          unit: 'л',
          color: C.water,
        },
        { key: 'fat', label: 'Жир', value: composed.body_fat_kg, unit: 'кг', color: C.fat },
      ].filter((p) => typeof p.value === 'number') as DonutPart[])
    : []

  const weightStatus = composed
    ? statusFor(composed.weight_kg, composed.norms?.weight_kg)
    : undefined

  const trendKey = trendKeys[0]
  const trendRow = TRACKABLE.find((r) => r.key === trendKey)!
  const trendKey2 = trendKeys[1]
  const trendRow2 = trendKey2 ? TRACKABLE.find((r) => r.key === trendKey2) : undefined

  const pointsFor = (key: keyof BodyMetric) => {
    const unit = TRACKABLE.find((r) => r.key === key)?.unit ?? ''
    return (metrics ?? [])
      .filter((m) => typeof m[key] === 'number')
      .map((m) => ({ x: m.logged_at, y: m[key] as number, cells: cellsFor(m, key, unit) }))
  }

  /**
   * Границы нормы печатает сам отчёт, и зависят они от роста и пола, а не от
   * даты. Берём из ближайшего замера, где они есть: в свежем взвешивании
   * норм может не оказаться вовсе.
   */
  const normFor = (key: keyof BodyMetric) => scans.find((m) => m.norms?.[key])?.norms?.[key]

  const trendPoints = pointsFor(trendKey)
  const trendPoints2 = trendKey2 ? pointsFor(trendKey2) : []

  /** Метрики, по которым в замерах есть хоть одно значение. */
  const trendable = useMemo(
    () => TRACKABLE.filter((r) => (metrics ?? []).some((m) => typeof m[r.key] === 'number')),
    [metrics],
  )

  // Ряды одного цвета отличались бы только пунктиром — уводим второй в синий.
  const colorOf = (r?: Row) => (!r || r.color === C.neutral ? 'var(--accent)' : r.color)
  const color1 = colorOf(trendRow)
  const color2raw = colorOf(trendRow2)
  const color2 = color2raw === color1 ? 'var(--info)' : color2raw

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void onFiles(e.target.files)}
      />

      <div className="row between" style={{ margin: '4px 0 10px' }}>
        <div className="mute-sm">
          {latest ? `Замер от ${formatDate(latest.logged_at)}` : 'Замеров пока нет'}
        </div>
        {scans.length > 1 && (
          <button className="btn sm" onClick={() => setHistoryOpen(true)}>
            Все замеры · {scans.length}
          </button>
        )}
      </div>

      {!latest && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{t.emptyTitle}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {t.emptyHint}
          </div>
        </div>
      )}

      {composed && donutParts.length > 0 && (
        <div className="card">
          <BodyDonut
            parts={donutParts}
            centerLabel="Вес"
            centerValue={`${composed.weight_kg ?? latest?.weight_kg ?? '—'} кг`}
            status={weightStatus ? STATUS_TEXT[weightStatus] : undefined}
            statusKind={weightStatus}
          />
          {composed !== latest && (
            <div className="mute-sm" style={{ textAlign: 'center', marginTop: 10 }}>
              Состав по замеру от {formatDate(composed.logged_at)}
            </div>
          )}
        </div>
      )}

      {latest && (
        <>
          <div className="section-title">Основные параметры</div>
          <div className="group stagger">
            {MAIN.map((row, i) => (
              <MetricRow
                key={String(row.key)}
                row={row}
                onOpen={() => setInfoRow(row)}
                now={
                  row.key === 'weight_kg' || row.key === 'body_fat_pct'
                    ? latest
                    : (composed ?? latest)
                }
                was={
                  row.key === 'weight_kg' || row.key === 'body_fat_pct'
                    ? previous
                    : composedPrev
                }
                index={i}
              />
            ))}
          </div>

          {/* Раздел показываем, только если в нём есть хоть одно значение:
              пустая рамка с заголовком читается как поломка. */}
          {composed && OTHER.some((r) => composed[r.key] != null) && (
            <>
              <div className="section-title">Другие</div>
              <div className="group stagger">
                {OTHER.map((row, i) => (
                  <MetricRow
                    key={String(row.key)}
                    row={row}
                    onOpen={() => setInfoRow(row)}
                    now={composed}
                    was={composedPrev}
                    index={i}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {segmented?.muscle_segments && (
        <>
          <div className="section-title">Анализ тела по сегментам</div>
          <div className="segmented" style={{ marginBottom: 12 }}>
            <button
              className={segTab === 'muscle' ? 'on' : ''}
              onClick={() => setSegTab('muscle')}
            >
              Мышцы
            </button>
            <button className={segTab === 'fat' ? 'on' : ''} onClick={() => setSegTab('fat')}>
              Жир
            </button>
          </div>
          <div className="card">
            <BodySegmentsFigure
              segments={
                (segTab === 'muscle' ? segmented.muscle_segments : segmented.fat_segments) ?? {}
              }
              kind={segTab}
              total={segTab === 'muscle' ? segmented.skeletal_muscle_kg : segmented.body_fat_kg}
            />
            {segmented !== latest && (
              <div className="mute-sm" style={{ textAlign: 'center', marginTop: 10 }}>
                По замеру от {formatDate(segmented.logged_at)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Переключатели стоят выше условия про точки: они относятся ко всему
          разделу, а не к выбранной метрике. Спрятанные вместе с графиком, они
          не давали уйти с метрики без данных — раздел исчезал целиком. */}
      {trendable.length > 0 && (
        <>
          <div className="section-title">Динамика</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {trendable.map((r) => (
              <button
                key={String(r.key)}
                className={`chip${trendKeys.includes(r.key) ? ' active' : ''}`}
                aria-pressed={trendKeys.includes(r.key)}
                onClick={() => toggleTrend(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="card">
            {trendPoints.length > 0 ? (
              <>
                <LineChart
                  data={trendPoints}
                  unit={trendRow.unit ? ` ${trendRow.unit}` : ''}
                  label={trendRow.label}
                  norm={normFor(trendKey)}
                  color={color1}
                  second={
                    trendRow2 && trendPoints2.length
                      ? {
                          data: trendPoints2,
                          color: color2,
                          unit: trendRow2.unit ? ` ${trendRow2.unit}` : '',
                          label: trendRow2.label,
                          norm: normFor(trendKey2),
                        }
                      : undefined
                  }
                />
                {(!trendRow2 || !trendPoints2.length || trendPoints.length === 1) && (
                  <div className="mute-sm" style={{ marginTop: 8 }}>
                    {trendPoints.length === 1
                      ? 'Нужен ещё один замер, чтобы увидеть тренд'
                      : 'Нажмите вторую метрику, чтобы сравнить'}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Нет данных по метрике «{trendRow.label}»</div>
            )}
          </div>
        </>
      )}

      {latest && (latest.optimal_weight_kg != null || latest.daily_kcal != null) && (
        <>
          <div className="section-title">Может быть полезным</div>
          <div className="group">
            {latest.optimal_weight_kg != null && (
              <div className="group-row">
                <span className="metric-icon" style={{ color: 'var(--c-muscle)' }}>
                  <IcoTarget size={20} />
                </span>
                <span className="grow">
                  <span className="title">Оптимальный вес</span>
                  <span className="sub" style={{ display: 'block' }}>
                    По росту и балансу мышц, жира и воды
                  </span>
                </span>
                <strong>{latest.optimal_weight_kg} кг</strong>
              </div>
            )}
            {latest.daily_kcal != null && (
              <div className="group-row">
                <span className="metric-icon" style={{ color: 'var(--c-fat)' }}>
                  <IcoApple size={20} />
                </span>
                <span className="grow">
                  <span className="title">Приём калорий</span>
                  <span className="sub" style={{ display: 'block' }}>
                    Ежедневный
                  </span>
                </span>
                <strong>{latest.daily_kcal} ккал</strong>
              </div>
            )}
            {macros && (
              <div className="group-row" style={{ display: 'block' }}>
                <div className="sub" style={{ marginBottom: 8 }}>
                  Разбивка по БЖУ · {Math.round(split.protein * 100)} /{' '}
                  {Math.round(split.fat * 100)} / {Math.round(split.carbs * 100)} % калорий
                </div>
                <div className="metrics">
                  <div className="metric">
                    <div className="cap">Белки</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--c-protein)' }}>
                      {macros.protein} г
                    </div>
                  </div>
                  <div className="metric">
                    <div className="cap">Жиры</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--c-fat)' }}>
                      {macros.fat} г
                    </div>
                  </div>
                  <div className="metric">
                    <div className="cap">Углеводы</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--c-muscle)' }}>
                      {macros.carbs} г
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {latest?.optimal_weight_kg != null && latest.weight_kg != null && (
        <>
          <div className="section-title">Улучшение композиции тела</div>
          <div className="card">
            <div className="metrics">
              <Target label="Вес" value={round1(latest.optimal_weight_kg - latest.weight_kg)} />
              <Target
                label="Жир"
                value={
                  latest.body_fat_kg != null
                    ? round1(latest.optimal_weight_kg - latest.weight_kg)
                    : undefined
                }
              />
              <Target label="Мышцы" value={0} />
            </div>
            <div className="mute-sm" style={{ marginTop: 10 }}>
              Сколько осталось до оптимального веса при сохранении мышечной массы.
            </div>
          </div>
        </>
      )}

      <button
        className="btn primary block"
        style={{ marginTop: 20 }}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy
          ? progress && progress.total > 1
            ? `Читаю ${progress.done + 1} из ${progress.total}…`
            : 'Читаю отчёт…'
          : latest
            ? t.uploadMore
            : t.uploadFirst}
      </button>
      <div className="mute-sm" style={{ textAlign: 'center', marginTop: 6 }}>
        Можно выбрать сразу несколько файлов
      </div>

      {/* Отчёт InBody есть не у всех: домашние весы, замер в другом зале или
          просто взвешивание тоже должны попадать в тренд. */}
      <button
        className="btn block"
        style={{ marginTop: 8 }}
        onClick={() => setManualOpen(true)}
      >
        Ввести замер вручную
      </button>

      <ManualMeasurementSheet
        open={manualOpen}
        userId={userId}
        onClose={() => setManualOpen(false)}
        onSaved={(replaced) => toast(replaced ? 'Замер обновлён' : 'Замер добавлен')}
      />

      <Sheet
        open={!!pending}
        title={single ? 'Данные из отчёта' : `Отчёты · ${pending?.length ?? 0}`}
        onClose={() => setPending(null)}
      >
        {single && (
          <div className="stack">
            <div className="muted">
              Отчёт от {formatDate(single.report.measured_at)}
              {single.report.person ? ` · ${single.report.person}` : ''}
            </div>
            <div className="group">
              {metricRows(single.report as unknown as BodyMetric).map(([label, value]) => (
                <div className="group-row" key={label}>
                  <span className="grow title">{label}</span>
                  <span className="value">{value}</span>
                </div>
              ))}
            </div>
            <button className="btn primary block" disabled={busy} onClick={confirmImport}>
              {busy ? 'Сохраняю…' : 'Добавить замер'}
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              {t.privacy}
            </div>
          </div>
        )}

        {/* Пачка: подробности каждого отчёта тут не помещаются и не нужны —
            важно, за какие даты замеры и какие файлы не прочитались. */}
        {pending && !single && (
          <div className="stack">
            <div className="group">
              {pending.map((x, i) => (
                <div
                  className={`group-row${x.error ? ' danger' : ''}`}
                  key={`${x.fileName}-${i}`}
                >
                  <span className="grow">
                    <span className="title">
                      {x.report ? formatDate(x.report.measured_at) : x.fileName}
                    </span>
                    <span className="sub" style={{ display: 'block' }}>
                      {x.error ??
                        [
                          x.report?.weight_kg != null && `${x.report.weight_kg} кг`,
                          x.report?.skeletal_muscle_kg != null &&
                            `мышцы ${x.report.skeletal_muscle_kg}`,
                          x.report?.body_fat_pct != null && `жир ${x.report.body_fat_pct}%`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {failedCount > 0 && (
              <div className="mute-sm">
                {failedCount} {plural(failedCount, ['файл', 'файла', 'файлов'])} прочитать не
                удалось — эти пропустим.
              </div>
            )}
            <button
              className="btn primary block"
              disabled={busy || readyCount === 0}
              onClick={confirmImport}
            >
              {busy ? 'Сохраняю…' : `Добавить замеры · ${readyCount}`}
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              {t.privacy}
            </div>
          </div>
        )}
      </Sheet>

      <MetricInfoSheet
        row={infoRow}
        metric={
          infoRow && (infoRow.key === 'weight_kg' || infoRow.key === 'body_fat_pct')
            ? latest
            : (composed ?? latest)
        }
        norm={infoRow ? normFor(infoRow.key) : undefined}
        onClose={() => setInfoRow(null)}
      />

      <Sheet
        open={historyOpen}
        title="Замеры"
        onClose={() => {
          setHistoryOpen(false)
          setConfirmWipe(false)
        }}
      >
        <div className="group">
          {scans.map((m) => (
            <div className="group-row" key={m.id}>
              <span className="grow">
                <span className="title">{formatDate(m.logged_at)}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {[
                    m.weight_kg != null && `${m.weight_kg} кг`,
                    m.skeletal_muscle_kg != null && `мышцы ${m.skeletal_muscle_kg}`,
                    m.body_fat_pct != null && `жир ${m.body_fat_pct}%`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button
                className="icon-btn"
                onClick={async () => {
                  await deleteBodyMetric(m.id)
                  toast('Замер удалён')
                }}
                aria-label="Удалить"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Подтверждение вторым нажатием, а не отдельным окном: удаление
            необратимо, но и лишний диалог поверх шторки некуда ставить.
            Текст называет последствие целиком — вес хранится здесь же, и
            без предупреждения его пропажа выглядела бы поломкой. */}
        {scans.length > 0 && (
          <button
            className="btn danger block"
            style={{ marginTop: 14 }}
            disabled={wiping}
            onClick={async () => {
              if (!confirmWipe) {
                setConfirmWipe(true)
                return
              }
              setWiping(true)
              const n = await deleteAllBodyMetrics(userId)
              setWiping(false)
              setConfirmWipe(false)
              setHistoryOpen(false)
              haptics.success()
              toast(`Удалено ${n} ${plural(n, ['замер', 'замера', 'замеров'])}`)
            }}
          >
            {confirmWipe
              ? 'Точно удалить? Вместе с ними исчезнет история веса'
              : 'Удалить все замеры'}
          </button>
        )}
      </Sheet>
    </>
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Шкала «ниже — норма — выше». Зоны нарисованы равными: насколько широки
 * «ниже» и «выше» в числах, не определено — отчёт печатает только границы
 * нормы. Внутри своей зоны отметка стоит пропорционально, а вылет дальше
 * ширины нормы упирается в край: рисовать бесконечность нечем.
 */
function NormScale({
  value,
  norm,
  unit,
  status,
}: {
  value: number
  norm: { min: number; max: number }
  unit?: string
  status?: NormStatus
}) {
  const span = norm.max - norm.min || 1
  const pos =
    value < norm.min
      ? Math.max(0, 1 - (norm.min - value) / span) / 3
      : value <= norm.max
        ? 1 / 3 + (value - norm.min) / span / 3
        : 2 / 3 + Math.min(1, (value - norm.max) / span) / 3

  const color =
    status === 'normal' ? 'var(--ok)' : status === 'high' ? 'var(--warn)' : 'var(--accent-ink)'

  return (
    <div className="norm-scale">
      <div className="norm-scale-heads">
        <span className={status === 'low' ? 'on' : undefined}>Ниже нормы</span>
        <span className={status === 'normal' ? 'on' : undefined}>Норма</span>
        <span className={status === 'high' ? 'on' : undefined}>Выше нормы</span>
      </div>
      <div className="norm-scale-bar">
        <i className="norm-scale-fill" style={{ width: `${pos * 100}%`, background: color }} />
        <i className="norm-scale-knob" style={{ left: `${pos * 100}%`, borderColor: color }} />
      </div>
      <div className="norm-scale-bounds">
        <span style={{ left: '33.333%' }}>
          {round1(norm.min)}
          {unit ? ` ${unit}` : ''}
        </span>
        <span style={{ left: '66.666%' }}>
          {round1(norm.max)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    </div>
  )
}

/** Разбор одной метрики: где значение относительно нормы и что это вообще. */
function MetricInfoSheet({
  row,
  metric,
  norm,
  onClose,
}: {
  row: Row | null
  metric?: BodyMetric
  norm?: { min: number; max: number }
  onClose: () => void
}) {
  const value = row && metric ? (metric[row.key] as number | undefined) : undefined
  const info = row ? METRIC_INFO[row.key] : undefined
  const status = statusFor(value, norm)

  return (
    <Sheet open={!!row} title={row?.label ?? ''} onClose={onClose}>
      {row && (
        <div className="stack">
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="metric-icon" style={{ color: row.color }}>
              <row.Icon size={22} />
            </span>
            <span style={{ fontWeight: 700, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
              {value == null ? '—' : round1(value)}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>
                {row.unit ? ` ${row.unit}` : ''}
              </span>
            </span>
          </div>

          {value != null && norm ? (
            <NormScale value={value} norm={norm} unit={row.unit} status={status} />
          ) : (
            <div className="mute-sm">Границы нормы в отчёте не указаны.</div>
          )}

          {info && (
            <>
              <div>{info.what}</div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Что влияет на {row.label.toLowerCase()}
                </div>
                <ul className="bullets">
                  {info.affects.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Target({ label, value }: { label: string; value?: number }) {
  return (
    <div className="metric">
      <div className="cap">{label}</div>
      <div className="num" style={{ fontSize: 22 }}>
        {value == null ? '—' : `${value > 0 ? '+' : ''}${value} кг`}
      </div>
    </div>
  )
}

function MetricRow({
  row,
  now,
  was,
  index = 0,
  onOpen,
}: {
  row: Row
  now: BodyMetric
  was?: BodyMetric
  index?: number
  onOpen?: () => void
}) {
  const value = now[row.key] as number | undefined
  const shown = useCountUp(value ?? 0, Number.isInteger(value) ? 0 : 1)
  if (value == null) return null

  const status = statusFor(value, now.norms?.[row.key as string])
  const prev = was?.[row.key] as number | undefined
  const diff = prev != null ? round1(value - prev) : null
  const good = diff == null || diff === 0 ? null : row.better === 'up' ? diff > 0 : diff < 0

  return (
    <div
      className={`group-row${onOpen ? ' tap' : ''}`}
      style={{ '--i': index } as React.CSSProperties}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <span className="metric-icon" style={{ color: row.color }}>
        <row.Icon size={20} />
      </span>
      <span className="grow">
        <span className="title">{row.label}</span>
        {status && (
          <span style={{ display: 'block', marginTop: 3 }}>
            <span className={`status ${status}`}>{STATUS_TEXT[status]}</span>
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {shown}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>
            {row.unit ? ` ${row.unit}` : ''}
          </span>
        </span>
        {diff != null && diff !== 0 && (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: good ? 'var(--ok)' : 'var(--danger)',
            }}
          >
            {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}
          </span>
        )}
      </span>
      {onOpen && <span className="chevron">›</span>}
    </div>
  )
}

function metricRows(m: Partial<BodyMetric>): [string, string][] {
  const rows: [string, string, number | undefined][] = [
    ['Вес', 'кг', m.weight_kg],
    ['Скелетные мышцы', 'кг', m.skeletal_muscle_kg],
    ['Жир', '%', m.body_fat_pct],
    ['Жировая масса', 'кг', m.body_fat_kg],
    ['Безжировая масса', 'кг', m.fat_free_mass_kg],
    ['Вода', 'л', m.body_water_l],
    ['Белок', 'кг', m.protein_kg],
    ['Минералы', 'кг', m.minerals_kg],
    ['Висцеральный жир', '', m.visceral_fat],
    ['ИМТ', '', m.bmi],
    ['Обмен веществ', 'ккал', m.bmr_kcal],
    ['Суточная норма', 'ккал', m.daily_kcal],
    ['Оптимальный вес', 'кг', m.optimal_weight_kg],
  ]
  return rows
    .filter(([, , v]) => v != null)
    .map(([label, unit, v]) => [label, `${v}${unit ? ` ${unit}` : ''}`])
}

/**
 * Ручной ввод замера. Обхваты важнее отдельных показателей: по ним
 * считается процент жира и производный состав, поэтому измерительная лента
 * заменяет весы с биоимпедансом там, где их нет.
 */
function ManualMeasurementSheet({
  open,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  userId: string
  onClose: () => void
  onSaved: (replaced: boolean) => void
}) {
  const profile = useLiveQuery(async () => db.profile.get(userId), [userId])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const num = (key: string) => {
    const raw = values[key]
    if (!raw) return undefined
    const n = parseFloat(raw.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  const heightCm = num('height_cm') ?? profile?.height_cm
  const sex = profile?.gender ?? 'м'

  // Считаем на лету: человек должен видеть, что даёт очередной обхват,
  // а не узнавать результат после сохранения.
  const derived = useMemo(
    () =>
      deriveComposition({
        weightKg: num('weight_kg'),
        heightCm,
        sex,
        girths: {
          neck: num('neck_cm'),
          waist: num('waist_cm'),
          hip: num('hip_cm'),
          chest: num('chest_cm'),
          thigh: num('thigh_cm'),
        },
        knownBodyFatPct: num('body_fat_pct'),
      }),
    [values, heightCm, sex],
  )

  /**
   * Полдень выбранного дня: замер хранится моментом времени, и от полуночи он
   * перескакивал бы на соседний день. Поле даты можно очистить прямо в
   * браузере, поэтому результат обязан быть числом — иначе в базу уйдёт NaN,
   * сортировка замеров рассыплется, а в истории появится «Invalid Date».
   */
  const at = new Date(`${date}T12:00:00`).getTime()
  const dateOk = Number.isFinite(at)

  const ownFat = num('body_fat_pct')
  const fatOutOfRange =
    ownFat != null && (ownFat < BODY_FAT_RANGE.min || ownFat > BODY_FAT_RANGE.max)

  const girthFields: { key: string; label: string; hint?: string }[] = [
    { key: 'neck_cm', label: 'Шея', hint: 'под кадыком, лента горизонтально' },
    { key: 'waist_cm', label: 'Талия', hint: 'на уровне пупка, не втягивая живот' },
    { key: 'hip_cm', label: 'Таз', hint: 'по самой широкой части ягодиц' },
    { key: 'chest_cm', label: 'Грудь' },
    { key: 'thigh_cm', label: 'Бедро' },
  ]

  const submit = async () => {
    const weight = num('weight_kg')
    if (!weight && derived.bodyFatPct == null) return
    if (!dateOk) return
    setBusy(true)
    try {
      const res = await saveManualMeasurement(
        {
          weight_kg: weight,
          neck_cm: num('neck_cm'),
          waist_cm: num('waist_cm'),
          hip_cm: num('hip_cm'),
          chest_cm: num('chest_cm'),
          thigh_cm: num('thigh_cm'),
          // Введённое руками значение приоритетнее расчётного, но в базу идёт
          // из расчёта: там оно уже подтянуто к правдоподобным границам, а от
          // сырых «120 %» безжировая масса уходила бы в минус.
          body_fat_pct: derived.bodyFatPct,
          body_fat_kg: derived.fatMassKg,
          fat_free_mass_kg: derived.leanMassKg,
          skeletal_muscle_kg: derived.skeletalMuscleKg,
          body_water_l: derived.bodyWaterL,
          protein_kg: derived.proteinKg,
          minerals_kg: derived.mineralsKg,
          bmi: derived.bmi,
          waist_to_height: derived.waistToHeight,
          waist_to_hip: derived.waistToHip,
          derived: num('body_fat_pct') == null && derived.bodyFatPct != null ? 1 : 0,
          logged_at: at,
        },
        userId,
      )
      setValues({})
      onSaved(res.replaced)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const rows: [string, string | undefined][] = [
    ['Жир', derived.bodyFatPct != null ? `${derived.bodyFatPct} %` : undefined],
    ['Жировая масса', derived.fatMassKg != null ? `${derived.fatMassKg} кг` : undefined],
    ['Безжировая масса', derived.leanMassKg != null ? `${derived.leanMassKg} кг` : undefined],
    [
      'Скелетные мышцы',
      derived.skeletalMuscleKg != null ? `${derived.skeletalMuscleKg} кг` : undefined,
    ],
    ['Вода', derived.bodyWaterL != null ? `${derived.bodyWaterL} л` : undefined],
    ['Белок', derived.proteinKg != null ? `${derived.proteinKg} кг` : undefined],
    ['Минералы', derived.mineralsKg != null ? `${derived.mineralsKg} кг` : undefined],
    ['ИМТ', derived.bmi != null ? String(derived.bmi) : undefined],
    [
      'Талия к росту',
      derived.waistToHeight != null ? String(derived.waistToHeight) : undefined,
    ],
    ['Талия к бёдрам', derived.waistToHip != null ? String(derived.waistToHip) : undefined],
  ]
  const shown = rows.filter(([, v]) => v)

  return (
    <Sheet open={open} title="Замер вручную" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Дата</label>
          <input
            className="input"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
          {!dateOk && (
            <div className="mute-sm" style={{ color: 'var(--warn)', marginTop: 6 }}>
              Укажите дату замера — без неё его некуда поставить в истории.
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <div className="field grow">
            <label>Вес, кг</label>
            <input
              className="input"
              inputMode="decimal"
              value={values.weight_kg ?? ''}
              onChange={set('weight_kg')}
              placeholder="—"
              style={{ fontFamily: 'var(--font-num)' }}
            />
          </div>
          <div className="field grow">
            <label>Рост, см</label>
            <input
              className="input"
              inputMode="numeric"
              value={values.height_cm ?? (profile?.height_cm ? String(profile.height_cm) : '')}
              onChange={set('height_cm')}
              placeholder="—"
              style={{ fontFamily: 'var(--font-num)' }}
            />
          </div>
        </div>

        <div className="section-title">Обхваты, см</div>
        <div className="group">
          {girthFields.map((f) => (
            <div className="group-row" key={f.key}>
              <span className="grow">
                <span className="title">{f.label}</span>
                {f.hint && (
                  <span className="sub" style={{ display: 'block' }}>
                    {f.hint}
                  </span>
                )}
              </span>
              <input
                className="input"
                inputMode="decimal"
                value={values[f.key] ?? ''}
                onChange={set(f.key)}
                placeholder="—"
                style={{
                  width: 84,
                  textAlign: 'center',
                  fontFamily: 'var(--font-num)',
                  padding: '9px 8px',
                }}
              />
            </div>
          ))}
        </div>

        {!heightCm && (
          <div className="mute-sm" style={{ color: 'var(--warn)' }}>
            Без роста процент жира по обхватам не посчитать — укажите его выше.
          </div>
        )}
        {heightCm && sex === 'ж' && !num('hip_cm') && (
          <div className="mute-sm" style={{ color: 'var(--warn)' }}>
            Для женской формулы нужен обхват таза: без него расчёт занижает жир.
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div className="section-title">Расчёт по обхватам</div>
            <div className="group">
              {shown.map(([label, value]) => (
                <div className="group-row" key={label}>
                  <span className="grow title">{label}</span>
                  <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mute-sm">
              Оценка по методике ВМФ США: погрешность около трёх процентов. Отчёт биоимпеданса
              точнее — если он есть, загрузите его.
            </div>
          </>
        )}

        <div className="field">
          <label>Свой процент жира, если знаете</label>
          <input
            className="input"
            inputMode="decimal"
            value={values.body_fat_pct ?? ''}
            onChange={set('body_fat_pct')}
            placeholder="—"
            style={{ fontFamily: 'var(--font-num)' }}
          />
          {/* Опечатку в проценте видно сразу: состав считается от него, и
              значение вне диапазона просто подтянется к границе. */}
          {fatOutOfRange && (
            <div className="mute-sm" style={{ color: 'var(--warn)', marginTop: 6 }}>
              Процент жира бывает от {BODY_FAT_RANGE.min} до {BODY_FAT_RANGE.max} — считаем по
              ближайшей границе.
            </div>
          )}
        </div>

        <button
          className="btn primary block"
          disabled={busy || !dateOk || (!values.weight_kg && derived.bodyFatPct == null)}
          onClick={submit}
        >
          Сохранить замер
        </button>
        <div className="mute-sm" style={{ textAlign: 'center' }}>
          Достаточно веса. Обхваты дадут состав тела без весов с биоимпедансом.
        </div>
      </div>
    </Sheet>
  )
}
