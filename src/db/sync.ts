/**
 * Синхронизация локальной базы с сервером.
 *
 * Приложение остаётся офлайн-первым: истина живёт в Dexie на устройстве,
 * сервер — общая копия, через которую данные видят тренер и другие
 * устройства того же человека. Поэтому обмен строится вокруг двух простых
 * операций — выгрузить накопившуюся очередь и забрать чужие изменения.
 *
 * Конфликты разбираются по updated_at: побеждает более поздняя запись.
 * Для тренировочного дневника этого достаточно — один человек почти никогда
 * не правит одну и ту же строку с двух устройств одновременно.
 */

import { db, APP_STATE_ID, type Contact, type ContactKind } from './db'
import { linkId } from './coach'
import {
  authUser,
  closeRealtime,
  getUser,
  isAuthed,
  listClients,
  openRealtime,
  pullRecords,
  uploadAttachment,
  upsertRecord,
  type RemoteRecord,
} from '../lib/backend'

/**
 * Что уезжает на сервер. Каталог упражнений сюда не входит: полторы тысячи
 * строк одинаковы у всех и приезжают при первом запуске из статики.
 */
const SYNCED = [
  'profile',
  'sessions',
  'sets',
  'bodyMetrics',
  'programs',
  'routines',
  'templateItems',
  'links',
  'invites',
  'assignments',
  'trainerNotes',
  'feedback',
  'nutritionProfile',
  'foodLogs',
  'foods',
  'attachments',
  'chat',
  'workoutReports',
  'reviews',
  'nutritionDays',
  'nutritionTargets',
  'dailyActivity',
  'tasks',
] as const

type SyncedTable = (typeof SYNCED)[number]

const isSynced = (name: string): name is SyncedTable =>
  (SYNCED as readonly string[]).includes(name)

/**
 * Чьи это данные. null означает «не наше, не отправляем».
 *
 * Возвращать текущего пользователя по умолчанию нельзя: каталог программ и
 * упражнений одинаков у всех и не принадлежит никому лично. Один такой
 * возврат приводил к тому, что при первом входе приложение пыталось
 * выгрузить наверх весь каталог и вставало намертво.
 */
async function ownerOf(
  table: SyncedTable,
  row: Record<string, unknown>,
): Promise<string | null> {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  switch (table) {
    case 'profile':
    case 'nutritionProfile':
      return str(row.id)

    case 'links':
    case 'assignments':
    case 'trainerNotes':
    case 'feedback':
    // Цели и задания заводит тренер, но принадлежат они тому, для кого
    // выданы: иначе клиент не получит ни своих норм, ни своей анкеты.
    case 'nutritionTargets':
    case 'tasks':
      return str(row.client_id)

    // Сообщение принадлежит клиенту независимо от того, кто его написал:
    // так одна и та же ветка доезжает до обоих собеседников.
    //
    // Кроме тех, в которых лежит файл. Голосовое и кружок хранятся Blob-ом,
    // а сюда уезжает json: строка доехала бы без звука, и собеседник увидел
    // бы сообщение, которое нельзя послушать. Пока у медиа нет своего пути
    // выгрузки (как у attachments), такие сообщения остаются на устройстве.
    case 'chat':
      return row.blob ? null : str(row.client_id)

    // Отметка о проверке принадлежит тренеру, а не клиенту. Только поэтому
    // она и не доезжает до клиента: сервер отдаёт человеку свои записи и
    // записи его клиентов, а чужой разбор о себе он не запросит.
    case 'invites':
    case 'reviews':
      return str(row.trainer_id)

    // Личная программа принадлежит клиенту, под которого собрана. Публичный
    // каталог не принадлежит никому и остаётся только на устройстве.
    case 'programs':
      return str(row.client_id)

    case 'routines':
      return ownerOfProgram(str(row.program_id))

    case 'templateItems': {
      const routine = str(row.routine_id)
      if (!routine) return null
      const parent = (await db.routines.get(routine)) as Record<string, unknown> | undefined
      return parent ? ownerOfProgram(str(parent.program_id)) : null
    }

    // Подход висит на тренировке, а не на человеке.
    case 'sets': {
      const sid = str(row.workout_session_id)
      if (!sid) return null
      const session = (await db.sessions.get(sid)) as Record<string, unknown> | undefined
      return session ? str(session.user_id) : null
    }

    // Кеш продуктов из внешней базы общий; своё уезжает только вручную
    // заведённое.
    case 'foods':
      return row.source === 'manual' ? str(row.user_id) : null

    default:
      return str(row.user_id)
  }
}

async function ownerOfProgram(programId: string | null): Promise<string | null> {
  if (!programId) return null
  const program = (await db.programs.get(programId)) as Record<string, unknown> | undefined
  const client = program?.client_id
  return typeof client === 'string' && client ? client : null
}

/** Ключ строки. У приглашений первичный ключ — сам код. */
const ridOf = (table: SyncedTable, row: Record<string, unknown>): string =>
  String(table === 'invites' ? row.code : row.id)

const stampOf = (row: Record<string, unknown>): number =>
  typeof row.updated_at === 'number' ? row.updated_at : Date.now()

// --- Курсоры ---

const cursorsOf = async (): Promise<Record<string, { pulled?: number; pushed?: number }>> =>
  (await db.appState.get(APP_STATE_ID))?.cursors ?? {}

/** Метка последнего принятого изменения с сервера для текущего аккаунта. */
async function pullCursor(): Promise<number> {
  const me = authUser()
  if (!me) return 0
  return (await cursorsOf())[me.id]?.pulled ?? 0
}

/** Метка, до которой локальные правки уже уехали наверх. */
async function pushCursor(): Promise<number> {
  const me = authUser()
  if (!me) return 0
  return (await cursorsOf())[me.id]?.pushed ?? 0
}

async function setCursors(patch: { pulled?: number; pushed?: number }) {
  const me = authUser()
  const state = await db.appState.get(APP_STATE_ID)
  if (!me || !state) return
  const all = state.cursors ?? {}
  await db.appState.put({
    ...state,
    cursors: { ...all, [me.id]: { ...all[me.id], ...patch } },
  })
}

// --- Выгрузка ---

/**
 * Отправляет наверх всё, что изменилось с прошлого раза.
 *
 * Раньше отправка шла по очереди мутаций, но её заполняют лишь несколько
 * мест в коде — большинство экранов пишут в Dexie напрямую, и их правки
 * никуда не уезжали. Обход таблиц по updated_at не зависит от того, вспомнил
 * ли автор конкретного экрана про очередь, и потому не теряет данные.
 */
export async function push(): Promise<number> {
  const me = authUser()
  if (!me) return 0

  const since = await pushCursor()
  // Границу берём до чтения: строки, изменённые прямо сейчас, попадут в
  // следующий проход, а не потеряются между ним и записью курсора.
  const boundary = Date.now()
  let sent = 0
  let failed = false

  for (const name of SYNCED) {
    if (failed) break
    // Вложения уезжают отдельно: в них лежит файл, а не json.
    if (name === 'attachments') continue
    const rows = (await db
      .table(name)
      .filter((r: Record<string, unknown>) => stampOf(r) > since)
      .toArray()) as Record<string, unknown>[]

    for (const row of rows) {
      const owner = await ownerOf(name, row)
      if (!owner) continue
      // Чужие строки не трогаем: сервер их всё равно отклонит, а лишний
      // запрос на мобильной сети стоит дороже проверки на месте.
      if (owner !== me.id) {
        if (!isMyClient(owner) || !TRAINER_AUTHORED.includes(name)) continue
      }

      try {
        await upsertRecord({
          owner,
          tbl: name,
          rid: ridOf(name, row),
          updated: stampOf(row),
          deleted: false,
          payload: row,
        })
        sent++
      } catch {
        // Курсор не сдвигаем: следующий проход начнёт с той же точки и
        // повторит всё, что не доехало.
        failed = true
        break
      }
    }
  }

  if (failed) return sent

  await drainDeletes()
  await setCursors({ pushed: boundary })
  return sent
}

/**
 * Что тренер заводит про клиента сам. Всё остальное в его базе — копия
 * присланного клиентом, и отправлять это обратно значит гонять данные по
 * кругу: каждая тренировка клиента улетала бы наверх дважды.
 */
const TRAINER_AUTHORED: readonly string[] = [
  'assignments',
  'feedback',
  'trainerNotes',
  'programs',
  'routines',
  'templateItems',
  'links',
  'nutritionTargets',
  'tasks',
  // Переписку ведут оба, а принадлежит она клиенту: без этой строки
  // сообщения тренера не уезжали бы дальше его собственного телефона.
  'chat',
  // Отчёты заводит клиент, но тренер дописывает в них свой ответ — без
  // этих двух его слова остались бы на его же телефоне.
  'workoutReports',
  'nutritionDays',
]

/** Кого этот тренер ведёт — список приезжает вместе с данными клиентов. */
let clientIds = new Set<string>()

const isMyClient = (id: string) => clientIds.has(id)

export function rememberClients(ids: string[]) {
  clientIds = new Set(ids)
}

/**
 * Удаления. Их нельзя вывести обходом таблиц — строки уже нет, поэтому
 * единственный след остаётся в очереди мутаций.
 */
async function drainDeletes() {
  const queue = await db.syncQueue.where('entity').notEqual('').toArray()
  const deletes = queue.filter((q) => q.op === 'delete')
  if (!deletes.length) return

  const done: string[] = []
  for (const item of deletes) {
    const stale = item.payload as Record<string, unknown> | undefined
    const table = item.entity
    if (!isSynced(table) || !stale) {
      done.push(item.id)
      continue
    }
    try {
      const owner = await ownerOf(table, stale)
      if (!owner) {
        done.push(item.id)
        continue
      }
      await upsertRecord({
        owner,
        tbl: table,
        rid: ridOf(table, stale),
        updated: Date.now(),
        deleted: true,
        payload: null,
      })
      done.push(item.id)
    } catch {
      /* попробуем в следующий раз */
    }
  }
  if (done.length) await db.syncQueue.bulkDelete(done)
}

// --- Загрузка ---

/** Забирает чужие изменения постранично и кладёт в локальную базу. */
export async function pull(): Promise<number> {
  if (!isAuthed()) return 0
  const since = await pullCursor()
  let page = 1
  let applied = 0
  let newest = since

  for (;;) {
    const res = await pullRecords(since, page)
    if (!res.items.length) break

    for (const rec of res.items) {
      newest = Math.max(newest, rec.updated)
      if (await apply(rec)) applied++
    }

    if (res.page * res.perPage >= res.totalItems) break
    page++
  }

  if (newest > since) await setCursors({ pulled: newest })
  return applied
}

async function apply(rec: RemoteRecord): Promise<boolean> {
  if (!isSynced(rec.tbl)) return false
  const table = db.table(rec.tbl)

  const key = rec.rid
  const local = (await table.get(key)) as Record<string, unknown> | undefined

  if (rec.deleted) {
    if (!local) return false
    await table.delete(key)
    return true
  }

  if (!rec.payload || typeof rec.payload !== 'object') return false
  // Локальная правка новее серверной — оставляем свою, её выгрузит push.
  if (local && stampOf(local) >= rec.updated) return false

  // У вложения на сервере нет самого файла. Если оригинал лежит на этом
  // устройстве, его нужно сохранить: иначе владелец видео потеряет его,
  // получив собственную же запись обратно.
  if (rec.tbl === 'attachments' && local?.blob) {
    await table.put({ ...(rec.payload as object), blob: local.blob })
    return true
  }

  await table.put(rec.payload)
  return true
}

// --- Вложения ---

/**
 * Отправляет видео и фото техники.
 *
 * Файлы не идут через таблицу records: там json, а ролик должен отдаваться
 * потоком и кэшироваться браузером. Поэтому сначала уезжает сам файл, а
 * потом строка со ссылкой на него — так тренер не увидит запись о видео,
 * которого ещё нет.
 */
async function pushAttachments(): Promise<number> {
  const me = authUser()
  if (!me) return 0

  const pending = await db.attachments
    .filter((a) => !a.remote_id && !!a.blob)
    .limit(3)
    .toArray()

  let sent = 0
  for (const a of pending) {
    if (!a.blob) continue
    try {
      const ext = a.mime.includes('mp4')
        ? 'mp4'
        : a.mime.includes('quicktime')
          ? 'mov'
          : a.kind === 'photo'
            ? 'jpg'
            : 'webm'
      const res = await uploadAttachment({
        owner: a.user_id,
        rid: a.id,
        kind: a.kind,
        note: a.exercise_id,
        file: a.blob,
        filename: `${a.id}.${ext}`,
      })
      await db.attachments.update(a.id, {
        remote_id: res.id,
        remote_file: res.file,
        updated_at: Date.now(),
      })

      // Строка со ссылкой уезжает без самого файла: он уже на сервере.
      const row = await db.attachments.get(a.id)
      if (row) {
        const { blob: _blob, ...meta } = row
        await upsertRecord({
          owner: a.user_id,
          tbl: 'attachments',
          rid: a.id,
          updated: Date.now(),
          deleted: false,
          payload: meta,
        })
      }
      sent++
    } catch {
      break
    }
  }
  return sent
}

// --- Клиенты тренера ---

/**
 * Забирает список клиентов прямо с сервера.
 *
 * Раньше кабинет строился на строке связи, которую присылал клиент, — то
 * есть тренер видел клиента только после того, как у того отработал обмен.
 * Источник правды здесь один: поле trainer в аккаунте клиента, по нему же
 * сервер выдаёт доступ к его данным. Всё остальное — производное.
 */
export async function syncClients(): Promise<number> {
  const me = authUser()
  if (!me || me.role !== 'trainer') return 0

  const clients = await listClients(me.id)
  rememberClients(clients.map((c) => c.id))

  for (const c of clients) {
    const existing = await db.profile.get(c.id)
    if (!existing) {
      await db.profile.add({
        id: c.id,
        name: c.name?.trim() || 'Клиент',
        role: 'CLIENT',
        plan: 'FREE',
        default_rest_seconds: 90,
        haptics_enabled: 1,
        sound_enabled: 1,
        updated_at: Date.now(),
      })
    }

    const link = await db.links.where('[trainer_id+client_id]').equals([me.id, c.id]).first()

    if (!link) {
      await db.links.add({
        id: linkId(me.id, c.id),
        trainer_id: me.id,
        client_id: c.id,
        status: 'ACTIVE',
        initiated_by: 'TRAINER',
        created_at: Date.now(),
        updated_at: Date.now(),
      })
    } else if (link.status !== 'ACTIVE') {
      await db.links.update(link.id, {
        status: 'ACTIVE',
        updated_at: Date.now(),
      })
    }
  }

  return clients.length
}

// --- Профиль тренера у клиента ---

/**
 * Подтягивает карточку своего тренера.
 *
 * Записи тренера клиенту недоступны — и правильно, чужие тренировки его не
 * касаются. Но имя и способы связи он видеть обязан, иначе кнопка «написать»
 * ведёт в пустоту. Поэтому они живут в самом аккаунте, куда клиенту доступ
 * открыт, а не в общей таблице записей.
 */
export async function syncMyTrainer(): Promise<boolean> {
  const me = authUser()
  if (!me || me.role === 'trainer' || !me.trainer) return false

  const trainer = await getUser(me.trainer)
  if (!trainer) return false

  const local = await db.profile.get(trainer.id)
  const patch = {
    name: trainer.name?.trim() || local?.name || 'Тренер',
    contacts: (trainer as { contacts?: Contact[] }).contacts ?? [],
    preferred_contact: (trainer as { preferred_contact?: ContactKind }).preferred_contact,
    updated_at: Date.now(),
  }

  if (local) {
    await db.profile.update(trainer.id, patch)
  } else {
    await db.profile.add({
      id: trainer.id,
      role: 'TRAINER',
      plan: 'PRO',
      default_rest_seconds: 90,
      haptics_enabled: 1,
      sound_enabled: 1,
      ...patch,
    })
  }
  return true
}

// --- Цикл ---

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** Один проход обмена. Выгрузка идёт первой, чтобы свои правки не затёрлись. */
export async function syncNow(): Promise<{
  pushed: number
  pulled: number
} | null> {
  if (running || !isAuthed() || !navigator.onLine) return null
  running = true
  try {
    // Список клиентов идёт первым: без него тренеру некуда складывать
    // приезжающие данные, да и права на них выдаёт именно эта связь.
    await syncClients().catch(() => 0)
    await syncMyTrainer().catch(() => false)
    const pushed = (await push()) + (await pushAttachments().catch(() => 0))
    const pulled = await pull()
    return { pushed, pulled }
  } catch {
    return null
  } finally {
    running = false
  }
}

/**
 * Периодический обмен. Раз в полминуты — компромисс между свежестью данных
 * у тренера и мобильным трафиком; плюс обмен при возврате в приложение и
 * при появлении сети, когда данные скорее всего устарели.
 */
export function startSync() {
  if (timer) return
  const kick = () => {
    void syncNow()
  }
  kick()

  // Живой поток — основной способ узнать об изменении. Запись прилетает
  // сразу и ложится в локальную базу, а экраны перерисовываются сами:
  // они подписаны на Dexie, а не на сеть.
  openRealtime(['records', 'users'], (e) => {
    void onRealtime(e)
  })

  // Опрос остаётся страховкой: поток может оборваться незаметно, и тогда
  // приложение не должно замереть до следующего запуска.
  timer = setInterval(kick, 60_000)
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick()
  })
}

/** Разбор одного события из живого потока. */
async function onRealtime(e: {
  collection: string
  action: 'create' | 'update' | 'delete'
  record: Record<string, unknown>
}) {
  // Изменился состав клиентов — например, кто-то ввёл код приглашения.
  if (e.collection === 'users') {
    await syncClients().catch(() => 0)
    return
  }

  if (e.collection !== 'records') return

  if (e.action === 'delete') {
    // В событии удаления полей уже нет, кроме идентификаторов: снимаем
    // строку по ним, если такая есть.
    const tbl = String(e.record.tbl ?? '')
    const rid = String(e.record.rid ?? '')
    if (isSynced(tbl) && rid) await db.table(tbl).delete(rid)
    return
  }

  await apply(e.record as unknown as RemoteRecord)

  // Курсор двигаем вместе с событием, чтобы страховочный опрос не тянул
  // уже применённое заново.
  const updated = Number(e.record.updated)
  if (Number.isFinite(updated)) {
    const since = await pullCursor()
    if (updated > since) await setCursors({ pulled: updated })
  }
}

export function stopSync() {
  if (timer) clearInterval(timer)
  timer = null
  closeRealtime()
}

/**
 * Первичная загрузка после входа: без неё человек, зашедший с нового
 * телефона, увидел бы пустое приложение и решил, что данные пропали.
 */
export async function initialPull(): Promise<void> {
  const user = authUser()
  if (!user) return
  await setCursors({ pulled: 0 })
  await pull()
}
