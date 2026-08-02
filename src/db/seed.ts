import { db, now, LOCAL_USER_ID, type Exercise } from './db'

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
  days: {
    name: string
    items: [string, number, number | undefined, number][]
  }[]
}

const PROGRAMS: ProgramSpec[] = [
  {
    name: 'Верх / Низ',
    description:
      'Четыре тренировки в неделю: два дня на верх тела, два на низ. Каждая группа получает нагрузку дважды за неделю — оптимальный режим для роста массы.',
    goal: 'Гипертрофия',
    level: 'Средний',
    days: [
      {
        name: 'Верх · сила',
        items: [
          ['Жим штанги лежа', 4, 6, 180],
          ['Тяга штанги в наклоне прямым хватом 35-40 градусов', 4, 8, 150],
          ['Жим штанги стоя', 3, 8, 120],
          ['Вертикальная тяга широким хватом', 3, 10, 90],
          ['Сгибание на бицепс стоя с прямой штангой', 3, 10, 60],
        ],
      },
      {
        name: 'Низ · сила',
        items: [
          ['Приседания со штангой на спине', 4, 6, 180],
          ['Румынская тяга со штангой', 3, 8, 150],
          ['Жим платформы с широкой постановкой ног', 3, 12, 120],
          ['Сгибание голени лежа', 3, 12, 60],
          ['Икры в тренажере стоя', 4, 15, 45],
        ],
      },
      {
        name: 'Верх · объём',
        items: [
          ['Жим гантелей на наклонной скамье', 4, 10, 120],
          ['Горизонтальная тяга блока широким хватом', 4, 12, 90],
          ['Сведение в тренажере "бабочка"', 3, 15, 60],
          ['Отведение рук через стороны стоя', 4, 15, 45],
          ['Разгибание на трицепс с канатом с верхнего блока', 3, 12, 60],
        ],
      },
      {
        name: 'Низ · объём',
        items: [
          ['Разгибание голени сидя', 4, 15, 60],
          ['Болгарский сплит присед с гантелями', 3, 10, 90],
          ['Ягодичный мост со штангой', 4, 12, 90],
          ['Отведение бедра на среднюю ягодичную', 3, 15, 45],
          ['Планка', 3, undefined, 45],
        ],
      },
    ],
  },
  {
    name: 'Push / Pull / Legs',
    description:
      'Классический сплит по типу движения: жимовые, тяговые и ноги. Подходит для трёх или шести тренировок в неделю.',
    goal: 'Гипертрофия',
    level: 'Средний',
    days: [
      {
        name: 'Push · грудь, плечи, трицепс',
        items: [
          ['Жим штанги лежа', 4, 8, 150],
          ['Жим гантелей на наклонной скамье', 3, 10, 120],
          ['Жим штанги стоя', 3, 8, 120],
          ['Отведение рук через стороны стоя', 4, 15, 45],
          ['Разгибание на трицепс с канатом с верхнего блока', 3, 12, 60],
        ],
      },
      {
        name: 'Pull · спина, бицепс',
        items: [
          ['Подтягивания широким хватом', 4, 8, 120],
          ['Тяга штанги в наклоне прямым хватом 35-40 градусов', 4, 8, 150],
          ['Горизонтальная тяга блока широким хватом', 3, 12, 90],
          ['Отведение в наклоне на заднюю дельту', 3, 15, 45],
          ['Сгибание на бицепс сидя (с супинацией)', 3, 12, 60],
        ],
      },
      {
        name: 'Legs · ноги, ягодицы',
        items: [
          ['Приседания со штангой на спине', 4, 8, 180],
          ['Румынская тяга со штангой', 3, 10, 150],
          ['Жим платформы с широкой постановкой ног', 3, 12, 120],
          ['Сгибание голени лежа', 3, 12, 60],
          ['Икры в тренажере стоя', 4, 15, 45],
        ],
      },
    ],
  },
  {
    name: 'Первые шаги в зале',
    description:
      'Три тренировки на всё тело для тех, кто начинает. Базовые движения в тренажёрах и с гантелями, минимум изоляции.',
    goal: 'Гипертрофия',
    level: 'Новичок',
    days: [
      {
        name: 'День A',
        items: [
          ['Жим платформы с широкой постановкой ног', 3, 12, 120],
          ['Жим гантелей на наклонной скамье', 3, 10, 90],
          ['Горизонтальная тяга блока широким хватом', 3, 12, 90],
          ['Планка', 3, undefined, 45],
        ],
      },
      {
        name: 'День B',
        items: [
          ['Румынская тяга со штангой', 3, 10, 120],
          ['Вертикальная тяга широким хватом', 3, 12, 90],
          ['Отведение рук через стороны стоя', 3, 15, 45],
          ['Скручивания (руки на полу)', 3, 15, 45],
        ],
      },
      {
        name: 'День C',
        items: [
          ['Приседания со штангой на спине', 3, 10, 150],
          ['Сведение в тренажере "бабочка"', 3, 15, 60],
          ['Сгибание на бицепс сидя (с супинацией)', 3, 12, 60],
          ['Икры в тренажере стоя', 3, 15, 45],
        ],
      },
    ],
  },
  {
    name: 'Ягодицы и ноги',
    description:
      'Три тренировки с акцентом на ягодичные. Тазовые движения и отведения в дополнение к приседу и тяге.',
    goal: 'Гипертрофия',
    level: 'Средний',
    days: [
      {
        name: 'Ягодичные · тяжёлый',
        items: [
          ['Ягодичный мост со штангой', 4, 10, 120],
          ['Румынская тяга со штангой', 4, 10, 150],
          ['Болгарский сплит присед с гантелями', 3, 10, 90],
          ['Отведение бедра на среднюю ягодичную', 3, 15, 45],
        ],
      },
      {
        name: 'Квадрицепс',
        items: [
          ['Приседания со штангой на спине', 4, 8, 180],
          ['Жим платформы с широкой постановкой ног', 3, 12, 120],
          ['Разгибание голени сидя', 3, 15, 60],
          ['Шаговые выпады с гантелями', 3, 12, 90],
        ],
      },
      {
        name: 'Ягодичные · объём',
        items: [
          ['Разгибание бедра на большую ягодичную', 4, 15, 60],
          ['Сгибание голени лежа', 4, 12, 60],
          ['Гиперэкстензия с весом (у груди)', 3, 12, 60],
          ['Планка', 3, undefined, 45],
        ],
      },
    ],
  },
  {
    name: 'Дома без оборудования',
    description: 'Тренировки с собственным весом. Нужен только коврик и двадцать пять минут.',
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
        name: 'Низ тела',
        items: [
          ['Приседания (воздушные)', 4, 20, 60],
          ['Ягодичный мостик на полу с резиной', 3, 15, 45],
          ['Шаговые выпады с гантелями', 3, 12, 60],
          ['Подъем ног лежа на полу', 3, 15, 45],
        ],
      },
      {
        name: 'Кардио и всё тело',
        items: [
          ['Берпи', 4, 10, 60],
          ['Приседания (воздушные)', 3, 20, 45],
          ['Отжимания', 3, 12, 45],
          ['Планка', 3, undefined, 45],
        ],
      },
    ],
  },
]

/** Названия сверяем без регистра и «ё»: источник пишет их непоследовательно. */
function normName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

/**
 * Убирает из базы упражнения, оставшиеся от прежнего встроенного каталога.
 * Каталог целиком приходит из внешней выгрузки, и старые записи без описаний
 * и видео только засоряют поиск.
 */
async function pruneBuiltInCatalog() {
  const legacy = await db.exercises
    .filter((e) => e.is_custom === 0 && !e.id.startsWith('ext-'))
    .toArray()
  if (!legacy.length) return

  const legacyIds = new Set(legacy.map((e) => e.id))
  // Упражнение, на которое ссылается история или шаблон, не удаляем:
  // иначе тренировки останутся с пустыми строками.
  const used = new Set<string>()
  for (const s of await db.sets.toArray()) used.add(s.exercise_id)
  for (const t of await db.templateItems.toArray()) used.add(t.exercise_id)

  const removable = [...legacyIds].filter((id) => !used.has(id))
  if (removable.length) await db.exercises.bulkDelete(removable)
}

/** Идемпотентно наполняет пустую базу. Вызывается при старте приложения. */
/** Устойчивый идентификатор строки каталога: одинаков на всех устройствах. */
const catalogId = (prefix: string, ...parts: number[]) => `${prefix}-${parts.join('-')}`

/** Собирает программы каталога. Вынесено, чтобы их можно было пересобрать. */
async function buildCatalogPrograms(byName: Map<string, string>, ts: number) {
  for (const [specIndex, spec] of PROGRAMS.entries()) {
    // Идентификаторы каталога выводятся из его состава, а не выдаются
    // случайно. Каталог одинаков у всех и наверх не уезжает, поэтому
    // случайные идентификаторы означали бы, что назначенная тренером
    // программа ссылается у клиента в пустоту.
    const programId = catalogId('prog', specIndex)
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
      const routineId = catalogId('rt', specIndex, dayIndex)
      await db.routines.add({
        id: routineId,
        program_id: programId,
        name: day.name,
        day_order: dayIndex + 1,
        updated_at: ts,
      })
      await db.templateItems.bulkAdd(
        day.items.map(([exName, sets, reps, rest], i) => ({
          id: catalogId('ti', specIndex, dayIndex, i),
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
}

/**
 * Чинит идентификаторы каталога на устройствах, где он собирался раньше со
 * случайными. Без этого назначенная тренером программа у клиента не
 * открывается: ссылка ведёт на строку, которой у него нет.
 */
export async function repairCatalogIds() {
  const already = await db.programs.get('prog-0')
  if (already) return

  const legacy = await db.programs.where('author_id').equals('system').toArray()
  if (!legacy.length) return

  const ids = new Set(legacy.map((p) => p.id))
  const routines = await db.routines.filter((r) => ids.has(r.program_id)).toArray()
  const routineIds = new Set(routines.map((r) => r.id))

  await db.templateItems.filter((t) => routineIds.has(t.routine_id)).delete()
  await db.routines.bulkDelete([...routineIds])
  await db.programs.bulkDelete([...ids])

  const exercises = await db.exercises.toArray()
  const byName = new Map(exercises.map((e) => [normName(e.name), e.id]))
  await buildCatalogPrograms(byName, now())

  // Назначения ссылались на прежние программы — переводим их по названию.
  const byOldId = new Map(legacy.map((p) => [p.id, p.name]))
  const fresh = await db.programs.where('author_id').equals('system').toArray()
  const byNameNew = new Map(fresh.map((p) => [p.name, p.id]))

  const assignments = await db.assignments.toArray()
  for (const a of assignments) {
    const name = byOldId.get(a.program_id)
    const next = name ? byNameNew.get(name) : undefined
    if (next && next !== a.program_id) {
      await db.assignments.update(a.id, {
        program_id: next,
        updated_at: now(),
      })
    }
  }
}

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

  await buildCatalogPrograms(byName, ts)

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
