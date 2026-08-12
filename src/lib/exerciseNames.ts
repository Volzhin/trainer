import { getLang } from './i18n'

/**
 * Английские названия упражнений.
 *
 * Живут отдельным файлом в статике, а не в общем словаре: тысяча с лишним
 * названий весит как заметная часть бандла, а нужны они только тем, кто
 * переключился на английский. Каталог упражнений загружается так же и по
 * той же причине.
 *
 * Свои упражнения, заведённые пользователем, здесь не встречаются и
 * остаются на том языке, на котором он их назвал, — переводить чужой ввод
 * приложение не вправе.
 */
let names: Record<string, string> | null = null

export async function loadExerciseNames(): Promise<void> {
  if (getLang() !== 'en' || names) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/exercises.en.json`)
    if (res.ok) names = (await res.json()) as Record<string, string>
  } catch {
    // Без словаря названия остаются русскими — это хуже перевода, но
    // лучше пустых строк, поэтому падать здесь нечему.
  }
}

/** Название упражнения на языке интерфейса. Нет перевода — отдаём как есть. */
export function exName(name: string | undefined): string {
  if (!name) return ''
  return names?.[name] ?? name
}

/**
 * Описание техники на языке интерфейса.
 *
 * Описание переводится целиком или никак: русский оригинал честнее, чем
 * подсказка, где половина строк на одном языке, а половина на другом.
 * Поэтому в словаре лежат только полностью переведённые тексты.
 */
export function exDesc(text: string | undefined): string {
  if (!text) return ''
  return names?.['desc:' + text] ?? text
}
