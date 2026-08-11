import {
  db,
  enqueue,
  uid,
  now,
  currentUserId,
  type ExerciseSet,
  type WorkoutSession,
} from './db'
import { invalidateExercises } from './catalog'
import { estimate1RM, startOfDay } from '../lib/calc'
import type { BodyMetric } from './db'
import type { InBodyReport } from '../lib/inbody'

/* ------------------------------- сессии ------------------------------- */

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  return db.sessions
    .where('user_id')
    .equals(currentUserId())
    .and((s) => s.is_completed === 0)
    .first()
}

/** Завершённые тренировки активного аккаунта, свежие сверху. */
export async function listMySessions(): Promise<WorkoutSession[]> {
  const rows = await db.sessions
    .where('user_id')
    .equals(currentUserId())
    .and((s) => s.is_completed === 1)
    .toArray()
  return rows.sort((a, b) => b.start_time - a.start_time)
}

/** Создаёт пустую сессию (спонтанная тренировка). */
export async function startEmptySession(title = 'Свободная тренировка') {
  const active = await getActiveSession()
  if (active) return active.id

  const session: WorkoutSession = {
    id: uid(),
    user_id: currentUserId(),
    title,
    start_time: now(),
    is_completed: 0,
    updated_at: now(),
  }
  await db.sessions.add(session)
  await enqueue('session', session.id, 'create', session)
  return session.id
}

/**
 * Разворачивает шаблон тренировочного дня в сессию с плановыми подходами.
 * Возвращает null, если разворачивать нечего — в дне нет ни одного упражнения.
 */
export async function startSessionFromRoutine(routineId: string): Promise<string | null> {
  const routine = await db.routines.get(routineId)
  if (!routine) throw new Error('Тренировочный день не найден')

  const items = await db.templateItems
    .where('routine_id')
    .equals(routineId)
    .sortBy('sequence_order')

  // Пустой день не разворачиваем. Экран тренировки открылся бы без единого
  // упражнения, и это читается как «приложение сломалось», а не как «в этот
  // день программы ничего не добавлено».
  if (!items.length) return null

  const active = await getActiveSession()
  if (active) {
    const started = await db.sets.where('workout_session_id').equals(active.id).count()
    // Незавершённая тренировка с подходами — та, которую человек делает
    // прямо сейчас; подменять её другой нельзя. А вот пустая — след прошлого
    // запуска, в ней нечего терять: раньше именно она молча открывалась
    // вместо выбранного дня, и человек видел пустой экран.
    if (started > 0) return active.id
    await discardSession(active.id)
  }

  const sessionId = uid()
  const ts = now()
  const session: WorkoutSession = {
    id: sessionId,
    user_id: currentUserId(),
    routine_id: routineId,
    title: routine.name,
    start_time: ts,
    is_completed: 0,
    updated_at: ts,
  }
  await db.sessions.add(session)

  const planned: ExerciseSet[] = []
  for (const [seq, item] of items.entries()) {
    // Подставляем результаты последней такой же тренировки — пользователю
    // не нужно вспоминать свои прошлые веса.
    const previous = await lastSetsForExercise(item.exercise_id)
    for (let i = 0; i < item.target_sets; i++) {
      const prev = previous[i] ?? previous[previous.length - 1]
      planned.push({
        id: uid(),
        workout_session_id: sessionId,
        exercise_id: item.exercise_id,
        sequence_order: seq,
        set_number: i + 1,
        weight_kg: prev?.weight_kg,
        reps_completed: prev?.reps_completed ?? item.target_reps,
        is_pr: 0,
        is_done: 0,
        updated_at: ts,
      })
    }
  }
  if (planned.length) await db.sets.bulkAdd(planned)
  await enqueue('session', sessionId, 'create', session)
  return sessionId
}

/**
 * Повторяет тренировку: создаёт новую сессию с тем же составом упражнений
 * и весами из образца. Плановых записей на будущую дату в модели нет,
 * поэтому копия начинается сразу — это и есть сценарий «повторить в зале».
 */
export async function repeatSession(sourceId: string): Promise<string> {
  const active = await getActiveSession()
  if (active) return active.id

  const source = await db.sessions.get(sourceId)
  if (!source) throw new Error('Тренировка не найдена')

  const rows = await db.sets.where('workout_session_id').equals(sourceId).toArray()
  const ts = now()
  const sessionId = uid()

  const session: WorkoutSession = {
    id: sessionId,
    user_id: currentUserId(),
    routine_id: source.routine_id,
    title: source.title,
    start_time: ts,
    is_completed: 0,
    updated_at: ts,
  }
  await db.sessions.add(session)

  // Веса переносим как ориентир, отметки выполнения — нет: подходы делаются заново.
  const copies: ExerciseSet[] = rows
    .sort((a, b) => a.sequence_order - b.sequence_order || a.set_number - b.set_number)
    .map((r) => ({
      id: uid(),
      workout_session_id: sessionId,
      exercise_id: r.exercise_id,
      sequence_order: r.sequence_order,
      set_number: r.set_number,
      weight_kg: r.weight_kg,
      reps_completed: r.reps_completed,
      is_pr: 0,
      is_done: 0,
      updated_at: ts,
    }))

  if (copies.length) await db.sets.bulkAdd(copies)
  await enqueue('session', sessionId, 'create', session)
  return sessionId
}

/** Добавляет упражнение в идущую сессию. */
export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const existing = await db.sets.where('workout_session_id').equals(sessionId).toArray()
  const seq = existing.length ? Math.max(...existing.map((s) => s.sequence_order)) + 1 : 0
  const previous = await lastSetsForExercise(exerciseId)
  const ts = now()

  const rows: ExerciseSet[] = Array.from(
    { length: Math.max(1, previous.length || 3) },
    (_, i) => ({
      id: uid(),
      workout_session_id: sessionId,
      exercise_id: exerciseId,
      sequence_order: seq,
      set_number: i + 1,
      weight_kg: previous[i]?.weight_kg ?? previous[previous.length - 1]?.weight_kg,
      reps_completed:
        previous[i]?.reps_completed ?? previous[previous.length - 1]?.reps_completed,
      is_pr: 0,
      is_done: 0,
      updated_at: ts,
    }),
  )
  await db.sets.bulkAdd(rows)
}

/** «Горячая замена» упражнения: тренажёр занят — меняем, не теряя структуру. */
export async function swapExercise(
  sessionId: string,
  sequenceOrder: number,
  newExerciseId: string,
) {
  const rows = await db.sets
    .where('[workout_session_id+sequence_order]')
    .equals([sessionId, sequenceOrder])
    .toArray()
  const previous = await lastSetsForExercise(newExerciseId)
  const ts = now()
  await db.transaction('rw', db.sets, async () => {
    for (const [i, row] of rows.entries()) {
      await db.sets.update(row.id, {
        exercise_id: newExerciseId,
        weight_kg: row.is_done ? row.weight_kg : previous[i]?.weight_kg,
        reps_completed: row.is_done ? row.reps_completed : previous[i]?.reps_completed,
        updated_at: ts,
      })
    }
  })
}

export async function removeExerciseFromSession(sessionId: string, sequenceOrder: number) {
  const rows = await db.sets
    .where('[workout_session_id+sequence_order]')
    .equals([sessionId, sequenceOrder])
    .toArray()
  await db.sets.bulkDelete(rows.map((r) => r.id))
}

export async function addSetRow(sessionId: string, exerciseId: string, sequenceOrder: number) {
  const rows = await db.sets
    .where('[workout_session_id+sequence_order]')
    .equals([sessionId, sequenceOrder])
    .toArray()
  const last = rows[rows.length - 1]
  await db.sets.add({
    id: uid(),
    workout_session_id: sessionId,
    exercise_id: exerciseId,
    sequence_order: sequenceOrder,
    set_number: rows.length + 1,
    weight_kg: last?.weight_kg,
    reps_completed: last?.reps_completed,
    is_pr: 0,
    is_done: 0,
    updated_at: now(),
  })
}

export async function deleteSetRow(setId: string) {
  await db.sets.delete(setId)
}

export async function updateSet(setId: string, patch: Partial<ExerciseSet>) {
  await db.sets.update(setId, { ...patch, updated_at: now() })
}

/**
 * Отмечает подход выполненным и проверяет личный рекорд по расчётному 1ПМ
 * среди всех ранее завершённых тренировок.
 */
export async function completeSet(setId: string): Promise<{ isPR: boolean }> {
  const set = await db.sets.get(setId)
  if (!set) return { isPR: false }

  let isPR = false
  if (set.weight_kg && set.reps_completed) {
    const score = estimate1RM(set.weight_kg, set.reps_completed)
    const best = await bestPreviousScore(set.exercise_id, set.workout_session_id)
    isPR = score > best && best > 0
  }
  await db.sets.update(setId, { is_done: 1, is_pr: isPR ? 1 : 0, updated_at: now() })
  await enqueue('set', setId, 'update', { ...set, is_done: 1 })
  return { isPR }
}

export async function uncompleteSet(setId: string) {
  await db.sets.update(setId, { is_done: 0, is_pr: 0, updated_at: now() })
}

export async function finishSession(sessionId: string, notes?: string) {
  // Незаполненные подходы не должны попадать в статистику.
  const rows = await db.sets.where('workout_session_id').equals(sessionId).toArray()
  const empty = rows.filter((r) => !r.is_done)
  if (empty.length) await db.sets.bulkDelete(empty.map((r) => r.id))

  const remaining = rows.length - empty.length
  if (remaining === 0) {
    await discardSession(sessionId)
    return false
  }

  await db.sessions.update(sessionId, {
    is_completed: 1,
    end_time: now(),
    notes,
    updated_at: now(),
  })
  await enqueue('session', sessionId, 'update', { is_completed: 1 })
  return true
}

export async function discardSession(sessionId: string) {
  const rows = await db.sets.where('workout_session_id').equals(sessionId).toArray()
  await db.sets.bulkDelete(rows.map((r) => r.id))
  await db.sessions.delete(sessionId)
}

/* ------------------------------- история ------------------------------ */

/** Подходы этого упражнения из последней завершённой тренировки. */
export async function lastSetsForExercise(exerciseId: string): Promise<ExerciseSet[]> {
  const sets = await db.sets.where('exercise_id').equals(exerciseId).toArray()
  const done = sets.filter((s) => s.is_done)
  if (!done.length) return []

  const sessions = await db.sessions.bulkGet([
    ...new Set(done.map((s) => s.workout_session_id)),
  ])
  const completed = sessions.filter((s): s is WorkoutSession => !!s && s.is_completed === 1)
  if (!completed.length) return []

  const latest = completed.sort((a, b) => b.start_time - a.start_time)[0]
  return done
    .filter((s) => s.workout_session_id === latest.id)
    .sort((a, b) => a.set_number - b.set_number)
}

async function bestPreviousScore(
  exerciseId: string,
  excludeSessionId: string,
): Promise<number> {
  const sets = await db.sets.where('exercise_id').equals(exerciseId).toArray()
  let best = 0
  for (const s of sets) {
    if (s.workout_session_id === excludeSessionId) continue
    if (!s.is_done || !s.weight_kg || !s.reps_completed) continue
    best = Math.max(best, estimate1RM(s.weight_kg, s.reps_completed))
  }
  return best
}

export async function deleteSession(sessionId: string) {
  await discardSession(sessionId)
}

/* -------------------------- пользовательские -------------------------- */

export async function createCustomExercise(input: {
  name: string
  muscle_group: string
  equipment: string
  description?: string
}) {
  const ex = {
    id: uid(),
    name: input.name.trim(),
    muscle_group: input.muscle_group as never,
    equipment: input.equipment as never,
    description: input.description,
    is_custom: 1 as const,
    creator_id: currentUserId(),
    is_time_based: 0 as const,
    updated_at: now(),
  }
  await db.exercises.add(ex)
  // Каталог читается из кеша — без сброса своё упражнение не появилось бы
  // в списках до перезапуска приложения.
  invalidateExercises()
  return ex.id
}

/**
 * Сохраняет импортированный отчёт InBody. Повторная загрузка того же файла
 * не плодит дубли: замер за ту же дату перезаписывается.
 */
export async function saveInBodyReport(
  report: InBodyReport,
  fileName?: string,
  userId = currentUserId(),
) {
  const { measured_at, person: _person, age: _age, height_cm, ...metrics } = report
  const dayStart = startOfDay(measured_at)

  const existing = await db.bodyMetrics
    .where('user_id')
    .equals(userId)
    .and((m) => startOfDay(m.logged_at) === dayStart && m.source === 'inbody')
    .first()

  const payload = {
    ...metrics,
    user_id: userId,
    logged_at: measured_at,
    source: 'inbody' as const,
    source_file: fileName,
    updated_at: now(),
  }

  if (existing) {
    await db.bodyMetrics.update(existing.id, payload)
  } else {
    await db.bodyMetrics.add({ id: uid(), ...payload })
  }

  // Рост из отчёта дописываем в профиль, если пользователь его не указывал.
  if (height_cm) {
    const profile = await db.profile.get(userId)
    if (profile && !profile.height_cm) {
      await db.profile.update(userId, { height_cm, updated_at: now() })
    }
  }
  return { replaced: !!existing }
}

/**
 * Ручной замер состава тела. Нужен там, где нет отчёта InBody: домашние
 * весы с биоимпедансом, замер в другом зале или просто взвешивание.
 * Хранится рядом с импортированными и участвует в тех же графиках.
 */
export async function saveManualMeasurement(
  input: Partial<Omit<BodyMetric, 'id' | 'user_id' | 'logged_at' | 'updated_at' | 'source'>> & {
    logged_at?: number
  },
  userId = currentUserId(),
) {
  const { logged_at, ...fields } = input
  const at = logged_at ?? now()

  // Замер за тот же день перезаписываем: два взвешивания подряд — это
  // уточнение, а не две точки тренда.
  const existing = await db.bodyMetrics
    .where('user_id')
    .equals(userId)
    .and((m) => startOfDay(m.logged_at) === startOfDay(at) && m.source !== 'inbody')
    .first()

  const payload = {
    ...fields,
    user_id: userId,
    logged_at: at,
    source: 'manual' as const,
    updated_at: now(),
  }
  if (existing) await db.bodyMetrics.update(existing.id, payload)
  else await db.bodyMetrics.add({ id: uid(), ...payload })

  return { replaced: !!existing }
}

export async function deleteBodyMetric(id: string) {
  const row = await db.bodyMetrics.get(id)
  await db.bodyMetrics.delete(id)
  // След удаления остаётся только в очереди: строки уже нет, и обход таблиц
  // её не найдёт. Без этого замер жил на сервере дальше и возвращался на
  // другом устройстве — человек удалял его снова и снова.
  if (row) await enqueue('bodyMetrics', id, 'delete', row)
}

/**
 * Чистит историю замеров целиком. Возвращает, сколько удалено, — счётчик
 * идёт в подтверждение, а не берётся из отфильтрованного списка на экране:
 * иначе обещание и результат расходятся.
 */
export async function deleteAllBodyMetrics(userId = currentUserId()) {
  const rows = await db.bodyMetrics.where('user_id').equals(userId).toArray()
  if (!rows.length) return 0
  await db.bodyMetrics.bulkDelete(rows.map((r) => r.id))
  for (const row of rows) await enqueue('bodyMetrics', row.id, 'delete', row)
  return rows.length
}

export async function listBodyMetrics(userId = currentUserId()) {
  return db.bodyMetrics.where('user_id').equals(userId).sortBy('logged_at')
}

export async function logBodyMetric(input: {
  weight_kg?: number
  body_fat_pct?: number
  waist_cm?: number
  chest_cm?: number
}) {
  await db.bodyMetrics.add({
    id: uid(),
    user_id: currentUserId(),
    ...input,
    logged_at: now(),
    updated_at: now(),
  })
}

export async function createProgram(name: string) {
  const id = uid()
  await db.programs.add({
    id,
    name,
    author_id: currentUserId(),
    goal: 'Гипертрофия',
    level: 'Средний',
    is_public: 0,
    updated_at: now(),
  })
  return id
}

/**
 * Отмечает программу каталога звёздочкой и снимает отметку.
 *
 * Каталог общий и наверх не уезжает, поэтому «добавить к себе» — это не копия
 * программы, а ссылка на неё в профиле. Копия разошлась бы с оригиналом при
 * первом же обновлении каталога, а список идентификаторов — нет.
 */
export async function toggleFavoriteProgram(programId: string): Promise<boolean> {
  const userId = currentUserId()
  const profile = await db.profile.get(userId)
  if (!profile) return false

  const current = profile.favorite_programs ?? []
  const added = !current.includes(programId)
  const next = added ? [...current, programId] : current.filter((id) => id !== programId)

  await db.profile.update(userId, { favorite_programs: next, updated_at: now() })
  return added
}

export async function createRoutine(programId: string, name: string) {
  const existing = await db.routines.where('program_id').equals(programId).count()
  const id = uid()
  await db.routines.add({
    id,
    program_id: programId,
    name,
    day_order: existing + 1,
    updated_at: now(),
  })
  return id
}

export async function addTemplateItem(routineId: string, exerciseId: string) {
  const existing = await db.templateItems.where('routine_id').equals(routineId).count()
  const profile = await db.profile.get(currentUserId())
  await db.templateItems.add({
    id: uid(),
    routine_id: routineId,
    exercise_id: exerciseId,
    sequence_order: existing,
    target_sets: 3,
    target_reps: 10,
    rest_seconds: profile?.default_rest_seconds ?? 90,
    updated_at: now(),
  })
}

/** Экспорт истории в CSV — данные пользователя не заперты в приложении. */
export async function exportHistoryCsv(): Promise<string> {
  const sessions = await db.sessions.where('is_completed').equals(1).sortBy('start_time')
  const exercises = await db.exercises.toArray()
  const exMap = new Map(exercises.map((e) => [e.id, e.name]))

  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = ['Дата;Тренировка;Упражнение;Подход;Вес, кг;Повторения;Рекорд']
  for (const session of sessions) {
    const rows = await db.sets.where('workout_session_id').equals(session.id).toArray()
    for (const s of rows.sort(
      (a, b) => a.sequence_order - b.sequence_order || a.set_number - b.set_number,
    )) {
      lines.push(
        [
          new Date(session.start_time).toISOString().slice(0, 10),
          esc(session.title),
          esc(exMap.get(s.exercise_id) ?? ''),
          s.set_number,
          s.weight_kg ?? '',
          s.reps_completed ?? '',
          s.is_pr ? 'да' : '',
        ].join(';'),
      )
    }
  }
  return lines.join('\n')
}

export async function deleteProgram(programId: string) {
  const routines = await db.routines.where('program_id').equals(programId).toArray()
  for (const r of routines) {
    const items = await db.templateItems.where('routine_id').equals(r.id).toArray()
    await db.templateItems.bulkDelete(items.map((i) => i.id))
  }
  await db.routines.bulkDelete(routines.map((r) => r.id))
  await db.programs.delete(programId)
}
