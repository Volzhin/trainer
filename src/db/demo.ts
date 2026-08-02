import {
  db,
  uid,
  now,
  currentUserId,
  type BodyMetric,
  type ExerciseSet,
  type WorkoutSession,
} from './db'
import { estimate1RM, startOfDay } from '../lib/calc'
import { addFeedback, addTrainerNote, assignProgram, createAccount } from './coach'

/**
 * Генераторы демонстрационных данных: история тренировок для клиента и
 * набор клиентов для кабинета тренера. Нужны, чтобы увидеть приложение
 * таким, каким его видит активный пользователь, а не пустым.
 */

/** Дни недели тренировок: пн, ср, пт. */
const TRAIN_DAYS = [0, 2, 4]

/** Стартовые рабочие веса, кг. Для упражнений с весом тела — доп. отягощение. */
const BASE_WEIGHT: Record<string, number> = {
  'Жим штанги лёжа': 72.5,
  'Жим гантелей в наклоне вверх': 26,
  'Жим штанги стоя': 42.5,
  'Махи гантелями в стороны': 10,
  'Разгибание в блоке (канат)': 25,
  'Становая тяга': 105,
  'Подтягивания широким хватом': 5,
  'Тяга штанги в наклоне': 60,
  'Обратная бабочка': 30,
  'Подъём гантелей с супинацией': 14,
  'Приседания со штангой': 87.5,
  'Жим ногами': 140,
  'Сгибание ног лёжа': 40,
  'Ягодичный мост со штангой': 70,
  'Подъёмы на носки стоя': 55,
}

/** Детерминированный ГПСЧ — демо-данные одинаковы при каждой генерации. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step

const NOTES = [
  'Хорошее самочувствие, техника чистая.',
  'Спал мало — жим шёл тяжело, последний подход не дожал.',
  'Добавил вес, колени в норме.',
  'Зал был забит, пришлось поменять порядок упражнений.',
  'Отличная тренировка, чувствую прогресс.',
]

type HistoryOptions = {
  weeks: number
  seed: number
  /** Множитель стартовых весов: новичок слабее опытного. */
  strength: number
  /** Доля пропущенных тренировок, 0..1. */
  missRate: number
  /** Сколько дней назад была последняя тренировка — для «выпавших» клиентов. */
  silentDays: number
  startWeightKg: number
}

type HistoryBundle = {
  sessions: WorkoutSession[]
  sets: ExerciseSet[]
  metrics: BodyMetric[]
}

function weekMondayOf(ts: number) {
  const day = startOfDay(ts)
  return day - ((new Date(day).getDay() + 6) % 7) * 86400_000
}

/** Строит историю тренировок по сплиту Push / Pull / Legs без записи в базу. */
async function buildHistory(userId: string, opts: HistoryOptions): Promise<HistoryBundle> {
  const rand = mulberry32(opts.seed)

  const program = await db.programs.filter((p) => p.name === 'Push / Pull / Legs').first()
  if (!program) throw new Error('Программа Push / Pull / Legs не найдена')

  const routines = await db.routines.where('program_id').equals(program.id).sortBy('day_order')
  const exercises = await db.exercises.toArray()
  const exMap = new Map(exercises.map((e) => [e.id, e]))

  const itemsByRoutine = new Map(
    await Promise.all(
      routines.map(async (r) => {
        const items = await db.templateItems
          .where('routine_id')
          .equals(r.id)
          .sortBy('sequence_order')
        return [r.id, items] as const
      }),
    ),
  )

  const sessions: WorkoutSession[] = []
  const allSets: ExerciseSet[] = []
  const bestScore = new Map<string, number>()

  const thisMonday = weekMondayOf(Date.now())
  // Клиент «замолчал» silentDays назад — тренировки позже этой даты не создаём.
  const cutoff = startOfDay(Date.now()) - opts.silentDays * 86400_000

  for (let week = 0; week < opts.weeks; week++) {
    const weekStart = thisMonday - (opts.weeks - 1 - week) * 7 * 86400_000

    for (const [dayIdx, routine] of routines.entries()) {
      if (rand() < opts.missRate) continue

      const start = weekStart + TRAIN_DAYS[dayIdx] * 86400_000
      if (start > cutoff || start > Date.now()) continue

      const startTime = start + (18 * 60 + 20 + Math.floor(rand() * 40)) * 60_000
      const durationMin = 52 + Math.floor(rand() * 28)

      const sessionId = uid()
      const items = itemsByRoutine.get(routine.id) ?? []
      const sessionSets: ExerciseSet[] = []

      for (const [seq, item] of items.entries()) {
        const exercise = exMap.get(item.exercise_id)
        if (!exercise) continue

        const base = (BASE_WEIGHT[exercise.name] ?? 20) * opts.strength
        // Прогрессия ~1.8% в неделю плюс небольшой разброс по дням.
        const progression = 1 + 0.018 * week + (rand() - 0.5) * 0.02
        const step = base >= 60 ? 2.5 : base >= 20 ? 2 : 1
        const weight = Math.max(step, roundTo(base * progression, step))

        const targetReps = item.target_reps ?? 10
        for (let i = 0; i < item.target_sets; i++) {
          const fatigue = i >= item.target_sets - 2 ? 1 + Math.floor(rand() * 2) : 0
          sessionSets.push({
            id: uid(),
            workout_session_id: sessionId,
            exercise_id: item.exercise_id,
            sequence_order: seq,
            set_number: i + 1,
            weight_kg: weight,
            reps_completed: Math.max(1, targetReps - fatigue),
            is_pr: 0,
            is_done: 1,
            updated_at: startTime,
          })
        }
      }

      // Рекорд отмечаем на лучшем подходе упражнения, если он побил прошлый максимум.
      const byExercise = new Map<string, ExerciseSet[]>()
      for (const s of sessionSets) {
        const arr = byExercise.get(s.exercise_id) ?? []
        arr.push(s)
        byExercise.set(s.exercise_id, arr)
      }
      for (const [exId, rows] of byExercise) {
        let top: ExerciseSet | undefined
        let topScore = 0
        for (const r of rows) {
          const score = estimate1RM(r.weight_kg!, r.reps_completed!)
          if (score > topScore) {
            topScore = score
            top = r
          }
        }
        const prev = bestScore.get(exId) ?? 0
        if (top && prev > 0 && topScore > prev) top.is_pr = 1
        if (topScore > prev) bestScore.set(exId, topScore)
      }

      sessions.push({
        id: sessionId,
        user_id: userId,
        routine_id: routine.id,
        title: routine.name,
        start_time: startTime,
        end_time: startTime + durationMin * 60_000,
        notes: rand() < 0.35 ? NOTES[Math.floor(rand() * NOTES.length)] : undefined,
        is_completed: 1,
        updated_at: startTime,
      })
      allSets.push(...sessionSets)
    }
  }

  const metrics: BodyMetric[] = []
  for (let week = 0; week <= opts.weeks; week++) {
    const ts = thisMonday - (opts.weeks - week) * 7 * 86400_000 + 8 * 3600_000
    if (ts > Date.now()) continue
    metrics.push({
      id: uid(),
      user_id: userId,
      weight_kg: Math.round((opts.startWeightKg - week * 0.42 + (rand() - 0.5) * 0.6) * 10) / 10,
      body_fat_pct: Math.round((21.5 - week * 0.38 + (rand() - 0.5) * 0.4) * 10) / 10,
      waist_cm: Math.round((88 - week * 0.45) * 10) / 10,
      logged_at: ts,
      updated_at: ts,
    })
  }

  return { sessions, sets: allSets, metrics }
}

/** Демо-история для активного клиента. Заменяет текущие тренировки и замеры. */
export async function generateDemoData(userId = currentUserId()) {
  const bundle = await buildHistory(userId, {
    weeks: 10,
    seed: 20260802,
    strength: 1,
    missRate: 0.08,
    silentDays: 0,
    startWeightKg: 84.2,
  })

  // Чистим только данные этого аккаунта — чужие клиенты не должны пострадать.
  const old = await db.sessions.where('user_id').equals(userId).toArray()
  const oldSets = await db.sets
    .where('workout_session_id')
    .anyOf(old.map((s) => s.id))
    .toArray()
  await db.sets.bulkDelete(oldSets.map((s) => s.id))
  await db.sessions.bulkDelete(old.map((s) => s.id))
  const oldMetrics = await db.bodyMetrics.where('user_id').equals(userId).toArray()
  await db.bodyMetrics.bulkDelete(oldMetrics.map((m) => m.id))

  await db.sessions.bulkAdd(bundle.sessions)
  await db.sets.bulkAdd(bundle.sets)
  await db.bodyMetrics.bulkAdd(bundle.metrics)

  await db.profile.update(userId, {
    name: 'Алексей',
    gender: 'м',
    height_cm: 182,
    goal_weight_kg: 78,
    experience: 'Средний',
    plan: 'PRO',
    updated_at: now(),
  })

  return {
    sessions: bundle.sessions.length,
    sets: bundle.sets.length,
    metrics: bundle.metrics.length,
  }
}

/** Профили демо-клиентов: разный опыт, дисциплина и давность последней тренировки. */
const DEMO_CLIENTS: {
  name: string
  experience: 'Новичок' | 'Средний' | 'Продвинутый'
  gender: 'м' | 'ж'
  height: number
  weight: number
  opts: Omit<HistoryOptions, 'startWeightKg'>
  weeklyTarget: number
  note?: string
}[] = [
  {
    name: 'Марина К.',
    experience: 'Новичок',
    gender: 'ж',
    height: 168,
    weight: 66,
    weeklyTarget: 3,
    opts: { weeks: 6, seed: 101, strength: 0.55, missRate: 0.1, silentDays: 0 },
    note: 'Болит правое плечо после старой травмы — жим над головой временно убрали.',
  },
  {
    name: 'Дмитрий Р.',
    experience: 'Продвинутый',
    gender: 'м',
    height: 186,
    weight: 92,
    weeklyTarget: 4,
    opts: { weeks: 12, seed: 202, strength: 1.25, missRate: 0.05, silentDays: 1 },
  },
  {
    name: 'Ольга В.',
    experience: 'Средний',
    gender: 'ж',
    height: 172,
    weight: 71,
    weeklyTarget: 3,
    opts: { weeks: 9, seed: 303, strength: 0.7, missRate: 0.12, silentDays: 2 },
  },
  {
    name: 'Артём С.',
    experience: 'Средний',
    gender: 'м',
    height: 178,
    weight: 81,
    weeklyTarget: 3,
    // Пропал почти на три недели — такой клиент должен всплывать первым в списке.
    opts: { weeks: 8, seed: 404, strength: 0.95, missRate: 0.25, silentDays: 19 },
    note: 'Уехал в командировку, вернётся в конце месяца.',
  },
  {
    name: 'Ксения Л.',
    experience: 'Новичок',
    gender: 'ж',
    height: 164,
    weight: 59,
    weeklyTarget: 2,
    opts: { weeks: 3, seed: 505, strength: 0.5, missRate: 0.15, silentDays: 4 },
  },
]

const FEEDBACK_TEXTS = [
  'Хорошая работа. На жиме держи лопатки сведёнными, не разгоняй темп.',
  'Тоннаж вырос — прибавляем 2.5 кг на следующей неделе.',
  'В приседе таз уходит вправо, сними видео последнего подхода.',
]

/** Создаёт демо-клиентов, привязывает их к тренеру и назначает программы. */
export async function seedTrainerDemo(trainerId = currentUserId()) {
  const trainer = await db.profile.get(trainerId)
  if (trainer?.role !== 'TRAINER') throw new Error('Активный аккаунт не тренер')

  const program = await db.programs.filter((p) => p.name === 'Push / Pull / Legs').first()
  const existing = await db.links.where('trainer_id').equals(trainerId).toArray()
  const existingNames = new Set(
    (await db.profile.bulkGet(existing.map((l) => l.client_id))).map((p) => p?.name),
  )

  let created = 0
  for (const spec of DEMO_CLIENTS) {
    if (existingNames.has(spec.name)) continue

    const clientId = await createAccount({ name: spec.name, role: 'CLIENT' })
    await db.profile.update(clientId, {
      experience: spec.experience,
      gender: spec.gender,
      height_cm: spec.height,
      updated_at: now(),
    })

    const bundle = await buildHistory(clientId, { ...spec.opts, startWeightKg: spec.weight })
    await db.sessions.bulkAdd(bundle.sessions)
    await db.sets.bulkAdd(bundle.sets)
    await db.bodyMetrics.bulkAdd(bundle.metrics)

    const ts = now()
    await db.links.add({
      id: uid(),
      trainer_id: trainerId,
      client_id: clientId,
      status: 'ACTIVE',
      initiated_by: 'TRAINER',
      created_at: ts - spec.opts.weeks * 7 * 86400_000,
      updated_at: ts,
    })

    if (program) {
      await assignProgram({
        clientId,
        programId: program.id,
        weeklyTarget: spec.weeklyTarget,
        note: spec.note,
        trainerId,
      })
    }
    if (spec.note) await addTrainerNote(clientId, spec.note, trainerId)

    // Комментарий к последней тренировке — чтобы клиент увидел обратную связь.
    const last = bundle.sessions.sort((a, b) => b.start_time - a.start_time)[0]
    if (last) {
      await addFeedback({
        clientId,
        sessionId: last.id,
        text: FEEDBACK_TEXTS[created % FEEDBACK_TEXTS.length],
        trainerId,
      })
    }
    created++
  }

  return { clients: created }
}
