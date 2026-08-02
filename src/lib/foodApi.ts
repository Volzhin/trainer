import type { FoodItem, Nutrients } from '../db/db'

/**
 * Источник данных о продуктах — Open Food Facts.
 *
 * ТЗ рекомендует FatSecret Premier, но он требует OAuth и собственного
 * бэкенда-прокси: класть ключи в клиент нельзя. Open Food Facts отдаёт
 * то же самое — поиск, штрихкоды, локализацию — по открытому API без
 * ключей, поэтому подходит для прототипа. Слой изолирован: смена
 * провайдера затрагивает только этот файл.
 */

const BASE = 'https://world.openfoodfacts.org'
/** Новый поисковый бэкенд OFF: старый /cgi/search.pl объявлен устаревшим. */
const SEARCH = 'https://search.openfoodfacts.org'
const FIELDS =
  'code,product_name,product_name_ru,brands,nutriments,serving_quantity,serving_size,image_small_url,quantity,countries_tags'

type OffProduct = {
  code?: string
  product_name?: string
  product_name_ru?: string
  /** Поиск отдаёт бренды массивом, товарный API — строкой. */
  brands?: string | string[]
  quantity?: string
  serving_quantity?: number | string
  serving_size?: string
  image_small_url?: string
  countries_tags?: string[]
  nutriments?: Record<string, number | string | undefined>
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : undefined
}

function toNutrients(n: OffProduct['nutriments']): Nutrients | null {
  if (!n) return null
  // Энергия иногда приходит только в килоджоулях.
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) ?? 0) / 4.184
  const protein = num(n.proteins_100g)
  const fat = num(n.fat_100g)
  const carbs = num(n.carbohydrates_100g)
  if (!kcal && !protein && !fat && !carbs) return null

  return {
    kcal: Math.round(kcal || 0),
    protein: round1(protein ?? 0),
    fat: round1(fat ?? 0),
    carbs: round1(carbs ?? 0),
    fiber: protein != null ? round1(num(n.fiber_100g) ?? 0) : undefined,
    sugar: round1(num(n.sugars_100g) ?? 0),
    sodium: round1((num(n.sodium_100g) ?? 0) * 1000),
  }
}

function toItem(p: OffProduct): FoodItem | null {
  const per100 = toNutrients(p.nutriments)
  const name = (p.product_name_ru || p.product_name || '').trim()
  if (!per100 || !name) return null

  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim()

  // Напитки считаем в миллилитрах: «100 г сока» звучит неестественно.
  const liquid = /(мл|ml|l\b|литр)/i.test(p.quantity ?? '') || /напит|сок|вода|молок/i.test(name)

  return {
    id: `off-${p.code ?? name}`,
    name,
    brand: brand || undefined,
    barcode: p.code,
    per100,
    unit: liquid ? 'мл' : 'г',
    serving_size: num(p.serving_quantity),
    serving_label: p.serving_size,
    source: 'off',
    image_url: p.image_small_url,
    used_at: 0,
    updated_at: Date.now(),
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Российские товары вперёд: аудитория русская, импорт — исключение. */
const russianFirst = (a: OffProduct, b: OffProduct) =>
  Number(b.countries_tags?.includes('en:russia') ?? false) -
  Number(a.countries_tags?.includes('en:russia') ?? false)

/**
 * Поиск по названию. Идём в новый бэкенд (search-a-licious): старый
 * /cgi/search.pl устарел и режется до 10 запросов в минуту на IP.
 * Если новый недоступен — падаем на старый, чтобы поиск не умирал совсем.
 */
export async function searchFood(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const url =
    `${SEARCH}/search?q=${encodeURIComponent(query)}` +
    `&page_size=25&langs=ru&fields=${FIELDS}`

  let products: OffProduct[]
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { hits?: OffProduct[] }
    products = data.hits ?? []
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    products = await legacySearch(query, signal)
  }

  return products.sort(russianFirst).map(toItem).filter((x): x is FoodItem => !!x)
}

async function legacySearch(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const res = await fetch(
    `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=25&lc=ru&fields=${FIELDS}`,
    { signal },
  )
  if (!res.ok) throw new Error('Поиск недоступен')
  const data = (await res.json()) as { products?: OffProduct[] }
  return data.products ?? []
}

/** Поиск по штрихкоду GTIN-13 / EAN / UPC. */
export async function findByBarcode(code: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}`, {
    signal,
  })
  if (!res.ok) return null
  const data = (await res.json()) as { status?: number; product?: OffProduct }
  if (data.status !== 1 || !data.product) return null
  return toItem({ ...data.product, code })
}

/** Пересчёт нутриентов со 100 г на съеденное количество. */
export function scaleNutrients(per100: Nutrients, amount: number): Nutrients {
  const k = amount / 100
  const s = (v?: number) => (v == null ? undefined : round1(v * k))
  return {
    kcal: Math.round(per100.kcal * k),
    protein: round1(per100.protein * k),
    fat: round1(per100.fat * k),
    carbs: round1(per100.carbs * k),
    fiber: s(per100.fiber),
    sugar: s(per100.sugar),
    sodium: s(per100.sodium),
  }
}
