import { db } from '../db/db'
import { exName } from './exerciseNames'

/**
 * Списки для фильтров собираются из самого каталога, а не задаются в коде:
 * справочник импортируется извне и его состав меняется вместе с выгрузкой.
 */
export type Facets = {
  muscles: string[]
  equipment: string[]
  sports: string[]
}

export async function loadFacets(): Promise<Facets> {
  const rows = await db.exercises.toArray()
  const muscles = new Map<string, number>()
  const equipment = new Map<string, number>()
  const sports = new Map<string, number>()

  for (const e of rows) {
    if (e.muscle_group) muscles.set(e.muscle_group, (muscles.get(e.muscle_group) ?? 0) + 1)
    if (e.equipment) equipment.set(e.equipment, (equipment.get(e.equipment) ?? 0) + 1)
    for (const s of e.sports ?? []) sports.set(s, (sports.get(s) ?? 0) + 1)
  }

  // Частые значения впереди — так фильтр начинается с того, что реально ищут.
  // «Другое» уходит в конец: это корзина для неразмеченного, а не категория,
  // с которой пользователь начинает поиск.
  const byCount = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => {
        const junk = (k: string) => (k === 'Другое' ? 1 : 0)
        return junk(a[0]) - junk(b[0]) || b[1] - a[1]
      })
      .map(([k]) => k)

  return { muscles: byCount(muscles), equipment: byCount(equipment), sports: byCount(sports) }
}

/** Поиск учитывает синонимы: в источнике у упражнений есть народные названия. */
export function matchesQuery(
  ex: { name: string; alt_names?: string[] },
  term: string,
): boolean {
  if (!term) return true
  const t = term.toLowerCase().replace(/ё/g, 'е')
  // Английское название ищем наравне с русским: человек, читающий каталог
  // по-английски, набирает «bench press», а не «жим лёжа», — и без этого
  // поиск не находил бы ровно то, что у него на экране.
  const hay = [ex.name, exName(ex.name), ...(ex.alt_names ?? [])]
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
  return hay.includes(t)
}
