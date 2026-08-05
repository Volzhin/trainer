import { useEffect, useMemo, useState } from 'react'
import { db, type Exercise } from './db'

/**
 * Каталог упражнений в памяти.
 *
 * Тысяча строк с описаниями, ссылками на видео и списками оборудования —
 * это полтора мегабайта после разбора. Их читали шесть экранов, каждый своим
 * live-запросом и заново при каждом открытии: на телефоне такое чтение
 * занимает десятки миллисекунд и выпадает кадрами ровно в момент перехода.
 *
 * Каталог при этом почти неизменен — он приезжает из статики один раз и
 * трогается, только когда человек заводит своё упражнение. Поэтому читаем
 * его однажды и раздаём всем один и тот же массив, а на изменения отвечаем
 * явным сбросом кеша, а не постоянной подпиской.
 */

let cache: Exercise[] | null = null
let inflight: Promise<Exercise[]> | null = null
const listeners = new Set<() => void>()

export async function loadExercises(): Promise<Exercise[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = db.exercises.toArray().then((rows) => {
      cache = rows
      inflight = null
      return rows
    })
  }
  return inflight
}

/**
 * Сбрасывает кеш. Вызывать после всего, что меняет справочник: своё
 * упражнение, первичное наполнение базы, чистка старого каталога.
 */
export function invalidateExercises() {
  cache = null
  inflight = null
  for (const notify of listeners) notify()
}

/** Каталог целиком. Пока не загрузился — пустой массив, как было у liveQuery. */
export function useExercises(): Exercise[] {
  const [rows, setRows] = useState<Exercise[]>(() => cache ?? [])

  useEffect(() => {
    let alive = true
    const sync = () => {
      void loadExercises().then((next) => {
        if (alive) setRows(next)
      })
    }
    sync()
    listeners.add(sync)
    return () => {
      alive = false
      listeners.delete(sync)
    }
  }, [])

  return rows
}

/** Каталог по идентификатору — то, ради чего его чаще всего и читают. */
export function useExerciseMap(): Map<string, Exercise> {
  const rows = useExercises()
  return useMemo(() => new Map(rows.map((e) => [e.id, e])), [rows])
}
