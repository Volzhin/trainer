import { db, uid, now, LOCAL_USER_ID, type Exercise } from './db'

/** Запись импортируемой базы: формат выгрузки внешнего справочника. */
type ImportedExercise = {
  id: string
  name: string
  alt: string[]
  muscle: string
  muscles: string[]
  eq: string
  eqAll: string[]
  type: string | null
  sports: (string | null)[]
  desc: string | null
  img: string | null
  yt: string | null
  kin: string | null
  restrict: string[]
  accents: string[]
}

/**
 * Импортирует внешнюю базу упражнений. Файл лежит в статике и забирается
 * запросом, а не импортом: полтора мегабайта справочника не должны попадать
 * в JS-бандл и висеть в памяти после первого запуска.
 */
async function importCatalog(): Promise<Exercise[]> {
  const url = `${import.meta.env.BASE_URL}data/exercises.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Не удалось загрузить каталог: ${response.status}`)
  const rows = (await response.json()) as ImportedExercise[]
  const ts = now()

  return rows.map((r) => ({
    id: `ext-${r.id}`,
    name: r.name,
    alt_names: r.alt?.length ? r.alt : undefined,
    muscle_group: r.muscle,
    secondary: r.muscles?.length > 1 ? r.muscles.slice(1) : undefined,
    equipment: r.eq,
    equipment_all: r.eqAll?.length ? r.eqAll : undefined,
    exercise_type: r.type ?? undefined,
    sports: r.sports?.filter(Boolean) as string[] | undefined,
    restrictions: r.restrict?.length ? r.restrict : undefined,
    accents: r.accents?.length ? r.accents : undefined,
    description: r.desc ?? undefined,
    image_url: r.img ?? undefined,
    video_url: r.yt ?? undefined,
    clip_url: r.kin ?? undefined,
    is_custom: 0 as const,
    updated_at: ts,
  }))
}

type ProgramSpec = {
  name: string
  description: string
  goal: 'Гипертрофия' | 'Сила' | 'Похудение' | 'Дом' | 'Кроссфит'
  level: 'Новичок' | 'Средний' | 'Продвинутый'
  days: { name: string; items: [string, number, number | undefined, number][] }[]
}

const PROGRAMS: ProgramSpec[] = [
  {
    name: 'Full Body для новичка',
    description: '3 тренировки в неделю на всё тело. Базовые движения, минимум изоляции — идеальный старт.',
    goal: 'Гипертрофия',
    level: 'Новичок',
    days: [
      {
        name: 'День A — всё тело',
        items: [
          ['Приседания со штангой на спине', 3, 8, 120],
          ['Жим штанги лежа', 3, 8, 120],
          ['Горизонтальная тяга блока широким хватом', 3, 10, 90],
          ['Жим гантелей сидя (локти в стороны)', 3, 12, 60],
          ['Планка', 3, undefined, 60],
        ],
      },
      {
        name: 'День B — всё тело',
        items: [
          ['Румынская тяга со штангой', 3, 8, 120],
          ['Вертикальная тяга широким хватом', 3, 10, 90],
          ['Жим в тренажере (акцент на верх груди)', 3, 10, 90],
          ['Шаговые выпады с гантелями', 3, 12, 90],
          ['Сгибание на бицепс стоя с прямой штангой', 3, 12, 60],
        ],
      },
    ],
  },
  {
    name: 'Push / Pull / Legs',
    description: 'Классический сплит на 3–6 тренировок в неделю. Оптимален для роста мышечной массы.',
    goal: 'Гипертрофия',
    level: 'Средний',
    days: [
      {
        name: 'Push — грудь, плечи, трицепс',
        items: [
          ['Жим штанги лежа', 4, 8, 150],
          ['Жим гантелей на наклонной скамье', 3, 10, 120],
          ['Жим штанги стоя', 3, 8, 120],
          ['Отведение рук через стороны стоя', 4, 15, 45],
          ['Разгибание на трицепс с канатом с верхнего блока', 3, 12, 60],
        ],
      },
      {
        name: 'Pull — спина, бицепс',
        items: [
          ['Становая тяга', 3, 5, 180],
          ['Подтягивания широким хватом', 4, 8, 120],
          ['Тяга штанги в наклоне прямым хватом 35-40 градусов', 3, 10, 120],
          ['Отведение в наклоне на заднюю дельту', 3, 15, 45],
          ['Сгибание на бицепс сидя (с супинацией)', 3, 12, 60],
        ],
      },
      {
        name: 'Legs — ноги, ягодицы',
        items: [
          ['Приседания со штангой на спине', 4, 8, 180],
          ['Жим платформы с широкой постановкой ног', 3, 12, 120],
          ['Сгибание голени лежа', 3, 12, 60],
          ['Ягодичный мост со штангой', 3, 12, 90],
          ['Икры в тренажере стоя', 4, 15, 45],
        ],
      },
    ],
  },
  {
    name: 'Сила 5×5',
    description: 'Линейная прогрессия на базовых движениях. Добавляйте 2.5 кг к рабочему весу каждую тренировку.',
    goal: 'Сила',
    level: 'Средний',
    days: [
      {
        name: 'Тренировка A',
        items: [
          ['Приседания со штангой на спине', 5, 5, 180],
          ['Жим штанги лежа', 5, 5, 180],
          ['Тяга штанги в наклоне прямым хватом 35-40 градусов', 5, 5, 180],
        ],
      },
      {
        name: 'Тренировка B',
        items: [
          ['Приседания со штангой на спине', 5, 5, 180],
          ['Жим штанги стоя', 5, 5, 180],
          ['Становая тяга', 1, 5, 240],
        ],
      },
    ],
  },
  {
    name: 'Дома без оборудования',
    description: 'Тренировки с собственным весом. Ничего не нужно, кроме коврика и 25 минут.',
    goal: 'Дом',
    level: 'Новичок',
    days: [
      {
        name: 'Верх тела',
        items: [
          ['Отжимания', 4, 12, 60],
          ['Обратные отжимания от скамьи', 3, 12, 60],
          ['Планка', 3, undefined, 45],
          ['Скручивания (руки на полу)', 3, 20, 45],
        ],
      },
      {
        name: 'Низ тела + кардио',
        items: [
          ['Приседания (воздушные)', 4, 20, 60],
          ['Шаговые выпады с гантелями', 3, 12, 60],
          ['Ягодичный мостик на полу с резиной', 3, 15, 45],
          ['Берпи', 3, 10, 60],
        ],
      },
    ],
  },
]

/** Сравнение названий: регистр и «ё» в источниках пишут по-разному. */
const normName = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim()

const isExternal = (e: Exercise) => e.id.startsWith('ext-')

/**
 * Убирает остатки прежнего встроенного каталога: в базе остаётся только
 * внешний справочник и упражнения, созданные пользователем. Ссылки из
 * шаблонов и истории переводим на одноимённые упражнения справочника,
 * чтобы программы и прошлые тренировки не осиротели.
 */
async function pruneBuiltInCatalog() {
  const legacy = await db.exercises.filter((e) => e.is_custom === 0 && !isExternal(e)).toArray()
  if (!legacy.length) return

  let external = await db.exercises.filter(isExternal).toArray()
  if (!external.length) {
    external = await importCatalog()
    await db.exercises.bulkAdd(external)
  }

  const byName = new Map(external.map((e) => [normName(e.name), e.id]))
  const remap = new Map<string, string>()
  for (const e of legacy) {
    const target = byName.get(normName(e.name))
    if (target) remap.set(e.id, target)
  }

  if (remap.size) {
    const move = (id: string) => remap.get(id) ?? id
    await db.templateItems
      .filter((i) => remap.has(i.exercise_id))
      .modify((i) => {
        i.exercise_id = move(i.exercise_id)
      })
    await db.sets
      .filter((s) => remap.has(s.exercise_id))
      .modify((s) => {
        s.exercise_id = move(s.exercise_id)
      })
    await db.attachments
      .filter((a) => remap.has(a.exercise_id))
      .modify((a) => {
        a.exercise_id = move(a.exercise_id)
      })
    await db.feedback
      .filter((f) => !!f.exercise_id && remap.has(f.exercise_id))
      .modify((f) => {
        f.exercise_id = move(f.exercise_id!)
      })
  }

  await db.exercises.bulkDelete(legacy.map((e) => e.id))
}

/** Идемпотентно наполняет пустую базу. Вызывается при старте приложения. */
export async function seedIfEmpty() {
  const count = await db.exercises.count()
  if (count > 0) {
    await pruneBuiltInCatalog()
    return
  }

  // Каталог целиком приходит из внешней базы: описания, фото и видео техники.
  const exercises = await importCatalog()
  await db.exercises.bulkAdd(exercises)

  const byName = new Map(exercises.map((e) => [normName(e.name), e.id]))
  const ts = now()

  for (const spec of PROGRAMS) {
    const programId = uid()
    await db.programs.add({
      id: programId,
      name: spec.name,
      description: spec.description,
      goal: spec.goal,
      level: spec.level,
      author_id: 'system',
      is_public: 1,
      updated_at: ts,
    })

    for (const [dayIndex, day] of spec.days.entries()) {
      const routineId = uid()
      await db.routines.add({
        id: routineId,
        program_id: programId,
        name: day.name,
        day_order: dayIndex + 1,
        updated_at: ts,
      })
      await db.templateItems.bulkAdd(
        day.items.map(([exName, sets, reps, rest], i) => ({
          id: uid(),
          routine_id: routineId,
          exercise_id: byName.get(normName(exName))!,
          sequence_order: i,
          target_sets: sets,
          target_reps: reps,
          rest_seconds: rest,
          updated_at: ts,
        })),
      )
    }
  }

  const hasProfile = await db.profile.get(LOCAL_USER_ID)
  if (!hasProfile) {
    await db.profile.add({
      id: LOCAL_USER_ID,
      name: 'Гость',
      role: 'CLIENT',
      plan: 'FREE',
      default_rest_seconds: 90,
      haptics_enabled: 1,
      sound_enabled: 1,
      updated_at: ts,
    })
  }
}
