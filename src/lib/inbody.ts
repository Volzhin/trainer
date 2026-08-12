/**
 * Разбор PDF-отчёта о составе тела (DDX Fitness / InBody).
 *
 * Отчёт свёрстан в две колонки, а подписи разбиты на отдельные слова, поэтому
 * читаем текст вместе с координатами: собираем строки, а внутри строки копим
 * слова в метку до первого числа — оно и есть значение этой метки.
 * pdf.js подключается динамическим импортом: он тяжёлый и нужен только здесь.
 */

export type Norm = { min: number; max: number }
export type NormStatus = 'low' | 'normal' | 'high'

/** Значение по одному сегменту тела: масса, процент от нормы и оценка. */
export type Segment = { kg: number; pct?: number; status?: NormStatus }

export type Segments = {
  left_arm?: Segment
  right_arm?: Segment
  trunk?: Segment
  left_leg?: Segment
  right_leg?: Segment
}

export type InBodyReport = {
  measured_at: number
  /** Границы нормы по метрикам — берём из самого отчёта, а не зашиваем в код. */
  norms?: Partial<Record<string, Norm>>
  muscle_segments?: Segments
  fat_segments?: Segments
  weight_kg?: number
  skeletal_muscle_kg?: number
  body_fat_pct?: number
  body_fat_kg?: number
  body_water_l?: number
  protein_kg?: number
  minerals_kg?: number
  visceral_fat?: number
  bmi?: number
  fat_free_mass_kg?: number
  bmr_kcal?: number
  daily_kcal?: number
  optimal_weight_kg?: number
  height_cm?: number
  age?: number
  /** Имя из отчёта — показываем при подтверждении, чтобы не залить чужой замер. */
  person?: string
}

type Item = { text: string; x: number; y: number }

/** Служебные слова вёрстки и единицы измерения — в метку не входят. */
const NOISE = /^(выше|ниже|нормы|кг|л|ккал|см|%|,|-|–)$/

const hasDigit = (s: string) => /\d/.test(s)

function toNumber(raw: string): number | undefined {
  const m = raw.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return undefined
  const n = parseFloat(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function normalizeLabel(parts: string[]): string {
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[,%]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.test(w))
    .join(' ')
}

/** Метки отчёта → поля замера. Первое совпадение сверху вниз выигрывает. */
const FIELDS: [Extract<keyof InBodyReport, string>, RegExp][] = [
  ['weight_kg', /^вес$/],
  ['skeletal_muscle_kg', /^мышцы$/],
  ['body_fat_pct', /^жир$/],
  ['body_water_l', /^вода$/],
  ['protein_kg', /^белок$/],
  ['minerals_kg', /^кости$/],
  ['visceral_fat', /висцеральный жир$/],
  ['bmi', /индекс массы тела$/],
  ['fat_free_mass_kg', /безжировая масса$/],
  ['bmr_kcal', /обмен веществ$/],
  ['daily_kcal', /суточная норма калорий$/],
  ['optimal_weight_kg', /оптимальный вес$/],
  ['body_fat_kg', /содержание жира$/],
  ['age', /возраст$/],
  ['height_cm', /^рост$/],
]

/** Граница колонок отчёта: слева один блок метрик, справа другой. */
const COLUMN_SPLIT = 315

function toLines(items: Item[]): Item[][] {
  const lines = new Map<number, Item[]>()
  for (const it of items) {
    const key = Math.round(it.y / 4)
    const arr = lines.get(key)
    if (arr) arr.push(it)
    else lines.set(key, [it])
  }
  return [...lines.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, arr]) => arr.sort((a, b) => a.x - b.x))
}

type Pair = { label: string; value: number; x: number; y: number }

/** Разбивает элементы на строки и вытаскивает пары «метка → число». */
function extractPairs(lines: Item[][]): Pair[] {
  const pairs: Pair[] = []
  for (const tokens of lines) {
    let buffer: Item[] = []
    for (const t of tokens) {
      if (hasDigit(t.text)) {
        const label = normalizeLabel(buffer.map((b) => b.text))
        const value = toNumber(t.text)
        if (label && value !== undefined) {
          // Колонку определяем по координате значения: в метку могло попасть
          // хвостовое слово соседней колонки («кг» перед «Висцеральный жир»).
          pairs.push({ label, value, x: t.x, y: t.y })
        }
        buffer = []
      } else {
        buffer.push(t)
      }
    }
  }
  return pairs
}

/** Диапазоны нормы печатаются строкой ниже метрики: «< A | A–B | > B». */
function extractNorms(lines: Item[][]): { min: number; max: number; x: number; y: number }[] {
  const out: { min: number; max: number; x: number; y: number }[] = []
  for (const tokens of lines) {
    for (const t of tokens) {
      // Запятая как десятичный разделитель: в отчётах с русской локалью норма
      // печатается как «62,0–81,0», и без неё пропадали бы разом полоса нормы
      // на графике, шкала «ниже — норма — выше» и статусы строк.
      const m = t.text.replace(/\s/g, '').match(/^([\d.,]+)[–-]([\d.,]+)$/)
      if (!m) continue
      const min = toNumber(m[1])
      const max = toNumber(m[2])
      if (min !== undefined && max !== undefined) out.push({ min, max, x: t.x, y: t.y })
    }
  }
  return out
}

/** Оценка значения относительно нормы отчёта. Используется в интерфейсе. */
export function statusFor(value: number | undefined, norm?: Norm): NormStatus | undefined {
  if (value == null || !norm) return undefined
  if (value < norm.min) return 'low'
  if (value > norm.max) return 'high'
  return 'normal'
}

function statusFromText(text: string): NormStatus | undefined {
  const t = text.toLowerCase()
  if (t.includes('выше')) return 'high'
  if (t.includes('ниже')) return 'low'
  if (t.includes('норма')) return 'normal'
  return undefined
}

/**
 * Сегментарный анализ: два блока («Содержание мышц» и «Содержание Жира»),
 * в каждом по три пары строк — руки, туловище, ноги.
 */
function extractSegments(lines: Item[][]): { muscle: Segments; fat: Segments } {
  const header = lines.find((toks) => toks.some((t) => /^Содержание$/i.test(t.text)))
  const empty = { muscle: {}, fat: {} }
  if (!header) return empty

  const headerY = header[0].y
  const body = lines.filter((toks) => toks[0].y > headerY + 5)

  // Разделяем каждую строку на левый (мышцы) и правый (жир) блок.
  const rows = body.map((toks) => ({
    y: toks[0].y,
    muscle: toks.filter((t) => t.x < COLUMN_SPLIT),
    fat: toks.filter((t) => t.x >= COLUMN_SPLIT),
  }))

  const build = (side: 'muscle' | 'fat'): Segments => {
    const kgRows: Item[][] = []
    const pctRows: Item[][] = []
    const statusRows: Item[][] = []

    for (const row of rows) {
      const toks = row[side]
      if (!toks.length) continue
      const numbers = toks.filter((t) => hasDigit(t.text))
      if (!numbers.length) {
        statusRows.push(toks)
      } else if (numbers.every((t) => t.text.includes('%'))) {
        pctRows.push(numbers)
      } else {
        kgRows.push(numbers.filter((t) => !/^(кг|л)$/i.test(t.text)))
      }
    }

    // Порядок блоков в отчёте: руки → туловище → ноги.
    const order: (keyof Segments)[][] = [
      ['left_arm', 'right_arm'],
      ['trunk'],
      ['left_leg', 'right_leg'],
    ]
    const result: Segments = {}

    for (const [i, keys] of order.entries()) {
      const kg = kgRows[i] ?? []
      const pct = pctRows[i] ?? []
      const statusText = (statusRows[i] ?? []).map((t) => t.text).join(' ')
      for (const [j, key] of keys.entries()) {
        const value = toNumber(kg[j]?.text ?? '')
        if (value == null) continue
        result[key] = {
          kg: value,
          pct: toNumber(pct[j]?.text ?? ''),
          status: statusFromText(statusText),
        }
      }
    }
    return result
  }

  return { muscle: build('muscle'), fat: build('fat') }
}

/**
 * Дата замера в отчёте — в формате ДД.ММ.ГГ рядом с подписью «Дата».
 * Не нашли — возвращаем null: замеры хранятся по дням, и подстановка
 * сегодняшнего числа схлопнула бы всю пачку нераспознанных отчётов в один
 * замер, о чём интерфейс отчитался бы как об удачной загрузке.
 */
function parseMeasuredAt(items: Item[]): number | null {
  const label = items.find((i) => /^Дата$/i.test(i.text))
  const scope = label
    ? items.filter((i) => Math.abs(i.y - label.y) < 8 && i.x > label.x)
    : items
  for (const i of scope) {
    const m = i.text.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
    if (!m) continue
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 12)
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }
  return null
}

async function readItems(file: File): Promise<Item[]> {
  const pdfjs = await import('pdfjs-dist')
  // Воркер берём из самого пакета: внешние CDN заблокированы политикой страницы.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const items: Item[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const height = page.getViewport({ scale: 1 }).height
    for (const raw of content.items) {
      const it = raw as { str?: string; transform?: number[] }
      const text = (it.str ?? '').trim()
      if (!text || !it.transform) continue
      items.push({
        text,
        x: it.transform[4],
        // Ось Y в PDF растёт снизу вверх — переворачиваем, чтобы «ниже» значило больше.
        y: height - it.transform[5] + (p - 1) * height,
      })
    }
  }
  return items
}

export async function parseInBodyPdf(file: File): Promise<InBodyReport> {
  const items = await readItems(file)
  if (!items.length) {
    throw new Error('В PDF нет текстового слоя — похоже, это скан')
  }

  const lines = toLines(items)
  const measuredAt = parseMeasuredAt(items)
  // Дату приписываем в самом конце: сначала нужно понять, отчёт ли это вообще,
  // иначе на постороннем PDF мы жаловались бы на дату, а не на файл.
  const report: Omit<InBodyReport, 'measured_at'> = { norms: {} }

  const pairs = extractPairs(lines)
  const norms = extractNorms(lines)
  /**
   * Метрика встречается в отчёте несколько раз (карточка сверху, блок истории,
   * шкала нормы). Значение берём из первого вхождения, а диапазон нормы —
   * из того вхождения, под которым напечатана шкала.
   */
  for (const [key, pattern] of FIELDS) {
    const matches = pairs.filter((p) => pattern.test(p.label))
    if (!matches.length) continue
    ;(report as Record<string, unknown>)[key] = matches[0].value

    for (const pair of matches) {
      const sameColumn = pair.x < COLUMN_SPLIT
      const norm = norms.find(
        (n) => n.y > pair.y && n.y - pair.y < 32 && n.x < COLUMN_SPLIT === sameColumn,
      )
      if (norm) {
        report.norms![key] = { min: norm.min, max: norm.max }
        break
      }
    }
  }

  const segments = extractSegments(lines)
  if (Object.keys(segments.muscle).length) report.muscle_segments = segments.muscle
  if (Object.keys(segments.fat).length) report.fat_segments = segments.fat

  const nameLabel = items.find((i) => /^Имя$/i.test(i.text))
  if (nameLabel) {
    report.person = items
      .filter(
        (i) => Math.abs(i.y - nameLabel.y) < 8 && i.x > nameLabel.x && i.x - nameLabel.x < 90,
      )
      .sort((a, b) => a.x - b.x)[0]?.text
  }

  // Абсолютную жировую массу отчёт печатает не всегда — считаем от процента.
  if (report.body_fat_kg == null && report.weight_kg && report.body_fat_pct) {
    report.body_fat_kg = Math.round(((report.weight_kg * report.body_fat_pct) / 100) * 10) / 10
  }

  if (report.weight_kg == null && report.body_fat_pct == null) {
    throw new Error('Не похоже на отчёт о составе тела — не нашли ни веса, ни процента жира')
  }
  if (measuredAt == null) {
    throw new Error('Не нашли дату замера — добавьте этот отчёт вручную, указав дату')
  }
  return { ...report, measured_at: measuredAt }
}
