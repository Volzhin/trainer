import { db, currentUserId, now, uid, type Attachment } from './db'
import { deleteAttachment } from './files'
import { attachmentUrl } from '../lib/backend'
import { locale } from '../lib/i18n'
import { localDate } from '../lib/tdee'

/**
 * Фото прогресса: серии по датам.
 *
 * Снимки тела раньше жили внутри задания «фото до/после». Задание
 * одноразовое, и это ломало ровно то, ради чего снимают: клиент прикрепил
 * четыре кадра «до», а через месяц свежим кадрам деться некуда — второго
 * задания может и не быть, а сравнивать нужно именно с первым.
 *
 * Поэтому единица здесь — серия, то есть день съёмки. Задание больше не
 * владеет снимками, оно лишь повод их сделать: та же съёмка из задания
 * попадает в общую ленту серий, потому что у неё есть дата.
 */

/** Четыре ракурса в порядке съёмки. Порядок один на всё приложение. */
export const POSE_KEYS: NonNullable<Attachment['pose']>[] = [
  'front',
  'side_left',
  'side_right',
  'back',
]

export type PhotoSeries = {
  /** День съёмки, YYYY-MM-DD. Он же ключ серии. */
  date: string
  /** Снимки серии — не больше одного на ракурс. */
  shots: Attachment[]
  /**
   * Серия собрана из старых снимков, у которых даты не было.
   *
   * Различать нужно не ради значка: такие кадры принадлежат заданию, и
   * снести их из ленты серий значило бы стереть сданный отчёт.
   */
  legacy: boolean
}

/**
 * День серии для снимка.
 *
 * У старых записей поля нет — берём день создания. Это не догадка: снимок
 * тела кладут в базу сразу после съёмки, разница между «снято» и
 * «сохранено» здесь меньше минуты.
 */
const dayOf = (a: Attachment): string => a.shot_date ?? localDate(a.created_at)

/** Полдень, чтобы перевод часов не сдвигал разницу дат на сутки. */
const atNoon = (date: string): number => new Date(`${date}T12:00:00`).getTime()

/** Сколько дней прошло между сериями. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((atNoon(to) - atNoon(from)) / 86_400_000)

/**
 * Подпись серии. С годом, в отличие от `formatDate`: сравнивают и через год,
 * а «14 марта» без года в такой паре читается как позапрошлая неделя.
 */
export const seriesLabel = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** Это снимок тела, а не скриншот дневника и не видео техники. */
const isBodyShot = (a: Attachment): boolean => a.kind === 'photo' && !!a.pose

/**
 * По кадру на ракурс, в общем для всего приложения порядке.
 *
 * Дубли на один ракурс возможны и без ошибки: клиент переснял кадр на
 * следующий день, и прежний остался при своей дате. Показываем последний —
 * он и есть тот, которым человек в итоге ответил.
 */
export function oneShotPerPose(list: Attachment[]): Attachment[] {
  const best = new Map<string, Attachment>()
  for (const a of list) {
    if (!isBodyShot(a)) continue
    const prev = best.get(a.pose!)
    if (!prev || a.created_at > prev.created_at) best.set(a.pose!, a)
  }
  return POSE_KEYS.map((p) => best.get(p)).filter((a): a is Attachment => !!a)
}

/**
 * Все серии человека, свежая первой.
 *
 * Старые снимки читаются наравне с новыми и ничем не переписываются: у
 * клиента уже лежат кадры «до», и именно с ними он через месяц сравнивается.
 * Разрушительной миграции здесь быть не может — она бы стёрла первую точку
 * отсчёта, единственную невосстановимую вещь во всей задаче.
 */
export async function photoSeries(userId = currentUserId()): Promise<PhotoSeries[]> {
  const rows = (await db.attachments.where('user_id').equals(userId).toArray()).filter(isBodyShot)

  const byDate = new Map<string, Attachment[]>()
  for (const a of rows) {
    const key = dayOf(a)
    const list = byDate.get(key)
    if (list) list.push(a)
    else byDate.set(key, [a])
  }

  const series: PhotoSeries[] = []
  for (const [date, list] of byDate) {
    // Один ракурс — одна карточка, но в пределах серии, а не задания.
    const shots = oneShotPerPose(list)
    series.push({ date, shots, legacy: shots.every((a) => !a.shot_date) })
  }

  return series.sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * Добавить кадр в серию за день.
 *
 * Прежний кадр того же ракурса в тот же день уходит: иначе за месяц
 * копится десяток почти одинаковых снимков, и непонятно, какой из них
 * сравнивать. Уходит только свой, помеченный датой: кадр, приложенный к
 * заданию до появления этого экрана, трогать нельзя — он часть сданного
 * отчёта, и его удаление оставило бы у тренера пустую рамку.
 */
export async function addSeriesPhoto(input: {
  date: string
  pose: NonNullable<Attachment['pose']>
  file: Blob
  userId?: string
  /** Задание, если съёмка идёт из него: тренер открывает отчёт по нему. */
  taskId?: string
}): Promise<string> {
  const userId = input.userId ?? currentUserId()
  const old = (await db.attachments.where('user_id').equals(userId).toArray()).filter(
    (a) => isBodyShot(a) && a.pose === input.pose && a.shot_date === input.date,
  )
  for (const a of old) await deleteAttachment(a.id)

  const id = uid()
  const ts = now()
  await db.attachments.add({
    id,
    user_id: userId,
    task_id: input.taskId,
    shot_date: input.date,
    pose: input.pose,
    kind: 'photo',
    blob: input.file,
    mime: input.file.type || 'image/jpeg',
    size: input.file.size,
    created_at: ts,
    updated_at: ts,
  })
  return id
}

/**
 * Файл снимка, откуда бы он ни был.
 *
 * У тренера локального Blob не бывает — оригиналы в его базу не приезжают,
 * и файл приходится тянуть по защищённой ссылке с токеном. Для коллажа
 * этого мало: чужая картинка, нарисованная на canvas прямо из адреса,
 * «пачкает» холст, и `toBlob` после этого отказывает. Поэтому забираем
 * файл запросом и работаем уже со своим Blob-ом.
 */
export async function photoBlob(a: Attachment): Promise<Blob | null> {
  if (a.blob) return a.blob
  if (!a.remote_id || !a.remote_file) return null
  try {
    const res = await fetch(await attachmentUrl(a.remote_id, a.remote_file))
    if (!res.ok) return null
    return await res.blob()
  } catch {
    // Офлайн у тренера — обычное дело. Коллаж соберётся без этого кадра и
    // честно скажет, какого именно не хватило.
    return null
  }
}

/** Сегодняшний день в формате серии — значение по умолчанию для новой съёмки. */
export const todaySeriesDate = (): string => localDate()
