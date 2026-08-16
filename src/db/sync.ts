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
  ApiError,
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
  'reportReplies',
] as const

type SyncedTable = (typeof SYNCED)[number]

const isSynced = (name: string): name is SyncedTable =>
  (SYNCED as readonly string[]).includes(name)

/**
 * Чья это строка. null означает «владельца не определить»: у общего каталога
 * его нет вовсе, а у подхода он выводится из тренировки, которой на этом
 * устройстве может ещё не быть.
 *
 * Ответ нужен обеим сторонам обмена. Выгрузка решает по нему, кому строка
 * принадлежит; приём — вправе ли приславший её трогать. Поэтому здесь только
 * владелец и ничего кроме: что именно не уезжает наверх, знает ownerForPush.
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
    case 'reportReplies':
      return str(row.client_id)

    // Сообщение принадлежит клиенту независимо от того, кто его написал:
    // так одна и та же ветка доезжает до обоих собеседников.
    case 'chat':
      return str(row.client_id)

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

    default:
      return str(row.user_id)
  }
}

/**
 * Чьи это данные с точки зрения выгрузки. null означает «не наше, наверх не
 * отправляем» — и это шире, чем «владельца нет».
 */
async function ownerForPush(
  table: SyncedTable,
  row: Record<string, unknown>,
): Promise<string | null> {
  // Голосовое и кружок хранятся Blob-ом, а наверх уезжает json: строка
  // доехала бы без звука, и собеседник увидел бы сообщение, которое нельзя
  // послушать. Пока у медиа нет своего пути выгрузки (как у attachments),
  // такие сообщения остаются на устройстве.
  if (table === 'chat' && row.blob) return null

  // Кеш продуктов из внешней базы общий; своё уезжает только вручную
  // заведённое.
  if (table === 'foods' && row.source !== 'manual') return null

  return ownerOf(table, row)
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

const cursorsOf = async (): Promise<
  Record<string, { pulled?: number; pulledSeq?: number; pushed?: number }>
> => (await db.appState.get(APP_STATE_ID))?.cursors ?? {}

/** Метка последнего принятого изменения с сервера для текущего аккаунта. */
/**
 * Докуда уже забрали чужие изменения — по часам сервера (поле seq).
 *
 * Имя нарочно новое. Прежний курсор pulled считался по часам того, кто
 * записал, и у него мог оказаться момент из будущего — тогда всё, что
 * приходило потом с других устройств, молча не проходило условие. Сменив
 * имя, мы начинаем с нуля: один раз выкачивается всё заново, зато без
 * унаследованной кривой отметки. Повторная выкачка безвредна — apply
 * пропускает записи, которые старше местных.
 */
async function pullCursor(): Promise<number> {
  const me = authUser()
  if (!me) return 0
  return (await cursorsOf())[me.id]?.pulledSeq ?? 0
}

/** Метка, до которой локальные правки уже уехали наверх. */
async function pushCursor(): Promise<number> {
  const me = authUser()
  if (!me) return 0
  return (await cursorsOf())[me.id]?.pushed ?? 0
}

async function setCursors(patch: { pulled?: number; pulledSeq?: number; pushed?: number }) {
  const me = authUser()
  const state = await db.appState.get(APP_STATE_ID)
  if (!me || !state) return
  const all = state.cursors ?? {}
  await db.appState.put({
    ...state,
    cursors: { ...all, [me.id]: { ...all[me.id], ...patch } },
  })
}

// --- Состояние обмена ---

/**
 * Почему выгрузка не доходит.
 *
 * Обмен молчал о своих бедах, и это дорого обошлось: сервер час не принимал
 * записи, у людей не уходили ни сообщения, ни назначения, а на экране всё
 * выглядело отправленным. Узнали от человека, а не от приложения.
 *
 * `offline` сюда не попадает намеренно: приложение офлайн-первое, работа без
 * сети — обычное дело, и пугать ею незачем. Речь только о том, что связь
 * есть, а данные не уезжают.
 */
export type SyncTrouble =
  /** Сервер не принял строку. Обмен встал и сам не починится. */
  | { kind: 'rejected'; table: string; message: string }
  /** Строки для человека, которого сервер не считает клиентом этого тренера. */
  | { kind: 'stranger'; owners: string[] }
  | null

let trouble: SyncTrouble = null
const troubleWatchers = new Set<(state: SyncTrouble) => void>()

export const syncTrouble = (): SyncTrouble => trouble

/** Подписка для экранов: состояние меняется в фоне, между перерисовками. */
export function onSyncTrouble(fn: (state: SyncTrouble) => void): () => void {
  troubleWatchers.add(fn)
  fn(trouble)
  return () => {
    troubleWatchers.delete(fn)
  }
}

function setTrouble(next: SyncTrouble) {
  // Сравниваем по содержимому: проход идёт раз в минуту, и одинаковое
  // состояние не должно дёргать перерисовку.
  if (JSON.stringify(next) === JSON.stringify(trouble)) return
  trouble = next
  for (const fn of troubleWatchers) fn(next)
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
  let rejected: { table: string; message: string } | null = null

  /**
   * Самая ранняя отметка отложенной строки — дальше неё курсор не пойдёт.
   *
   * Пропустить строку и подвинуть курсор — значит потерять её навсегда:
   * следующий проход берёт только то, что новее отметки, и пропущенное под
   * условие уже не попадёт. Придержанный курсор стоит лишнего обхода, зато
   * отложенное уедет само, как только причина уйдёт.
   */
  let held = Number.POSITIVE_INFINITY
  const stranded = new Set<string>()

  for (const name of SYNCED) {
    if (failed) break
    // Вложения уезжают отдельно: в них лежит файл, а не json.
    if (name === 'attachments') continue
    const rows = (await db
      .table(name)
      .filter((r: Record<string, unknown>) => stampOf(r) > since)
      .toArray()) as Record<string, unknown>[]

    for (const row of rows) {
      const owner = await ownerForPush(name, row)
      if (!owner) continue

      // Заметки тренера про меня — не мои. Сервер их у клиента и не примет:
      // они принадлежат ему по владельцу, но заводит и читает их только
      // тренер. Строки могли осесть на устройстве от прежних версий, и
      // попытка их выгрузить упёрлась бы в отказ и остановила обмен.
      if (name === 'trainerNotes' && owner === me.id) continue

      // Чужие строки не трогаем: сервер их всё равно отклонит, а лишний
      // запрос на мобильной сети стоит дороже проверки на месте.
      if (owner !== me.id) {
        if (!TRAINER_AUTHORED.includes(name)) continue
        if (!isMyClient(owner)) {
          // Неизвестно, наш ли это клиент: список не приехал. Пропустить
          // молча нельзя — курсор уйдёт вперёд, и строка (ответ тренера,
          // назначение, сообщение) не попадёт уже ни в один проход.
          if (!clientsKnown) {
            failed = true
            break
          }
          /*
           * Список приехал, и этого человека в нём нет.
           *
           * В кабинете он при этом есть: кабинет строится по локальной
           * таблице links, а право писать даёт поле trainer в его аккаунте
           * на сервере — и списки расходятся, если связь оборвалась или не
           * доехала. Тренер тогда пишет сообщения и назначает программы в
           * пустоту, а выглядит это как обычная работа.
           *
           * Строку придерживаем и говорим об этом вслух. Прежде она молча
           * пропускалась, курсор уходил вперёд, и написанное не отправлялось
           * уже никогда — даже после того, как связь восстановят.
           */
          if (await db.links.where('client_id').equals(owner).first()) {
            stranded.add(owner)
            held = Math.min(held, stampOf(row))
          }
          continue
        }
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
      } catch (e) {
        // Курсор не сдвигаем: следующий проход начнёт с той же точки и
        // повторит всё, что не доехало.
        failed = true
        // Отказ сервера и обрыв связи выглядят одинаково — строка не уехала, —
        // но значат разное. Без сети обмен догонит сам, и говорить не о чем;
        // отказ сам не пройдёт, и молчать о нём нельзя.
        // 401 не в счёт: это оборвавшаяся сессия, и про неё человеку говорит
        // экран входа. Полоса «сервер не принимает» тут только запутала бы.
        //
        // 429 — тоже не в счёт, но по другой причине: так сервер просит
        // сбавить темп. Первый обмен с большой историей упирается в потолок
        // легко (на строку уходит два запроса), а следующий проход довезёт
        // остаток — курсор на отказе не двигается. Тревожить этим человека
        // значит приучать его не верить полосе.
        if (e instanceof ApiError && e.status > 401 && e.status < 500 && e.status !== 429) {
          rejected = { table: name, message: e.message }
        }
        break
      }
    }
  }

  if (failed) {
    setTrouble(rejected ? { kind: 'rejected', ...rejected } : trouble)
    return sent
  }

  await drainDeletes()
  // Через отложенную строку курсор не переносим — см. held выше.
  await setCursors({ pushed: Math.min(boundary, held - 1) })
  setTrouble(stranded.size ? { kind: 'stranger', owners: [...stranded] } : null)
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
  // Ответ на отчёт пишет тренер, а адресован он клиенту.
  // Самих отчётов здесь нет: тренер в них больше ничего не дописывает —
  // его слова лежат в reportReplies. Пока ответ жил внутри строки отчёта,
  // обмен, разбирающий конфликты строкой целиком, стирал им правку клиента.
  // Замеров нет намеренно: их тренер не комментирует.
  'reportReplies',
]

/** Кого этот тренер ведёт — список приезжает вместе с данными клиентов. */
let clientIds = new Set<string>()

/**
 * Достоверен ли этот список прямо сейчас. Пустой набор означает и «клиентов
 * нет», и «список не доехал», а решения это требует разного: во втором
 * случае выгрузку надо остановить, а не пропускать строки как чужие.
 */
let clientsKnown = false

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
      // Владелец, запомненный при удалении, главнее вычисленного: родителя,
      // по которому его ищут, к этому моменту может уже не быть.
      const owner = item.owner ?? (await ownerForPush(table, stale))
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
      // Курсор двигаем по серверной метке, а не по авторской: иначе он
      // снова начнёт зависеть от чужих часов.
      if (typeof rec.seq === 'number') newest = Math.max(newest, rec.seq)
      try {
        if (await apply(rec)) applied++
      } catch {
        // Одна негодная запись не должна останавливать обмен. Исключение
        // обрывало проход, курсор замирал на ней, и каждый следующий заход
        // спотыкался о неё же — приложение переставало получать вообще
        // что-либо. Пропускаем её и идём дальше.
      }
    }

    if (res.page * res.perPage >= res.totalItems) break
    page++
  }

  if (newest > since) await setCursors({ pulledSeq: newest })
  return applied
}

/**
 * Таблицы, где владелец выводится из родителя. Удалили тренировку — и у её
 * подхода владельца уже не спросить, поэтому «не определился» значит здесь
 * «строка осиротела», а не «строка чужая».
 */
const DERIVED_OWNER: readonly string[] = ['sets', 'routines', 'templateItems']

/**
 * Записан ли владелец в самом ключе — и тот ли это владелец.
 *
 * У части таблиц первичный ключ выводится из человека: профиль лежит под его
 * идентификатором, день питания и дневная активность — под «человек:дата»,
 * связь — под «link-тренер-клиент». По такому ключу их и читают, поэтому
 * чужой ключ означает не лишнюю строку, а подменённую: тренер, открыв свой
 * день, увидел бы присланное клиентом. Ключи, из человека не выводимые
 * (случайный uid, связи старого образца), не судим — их закрывает сверка с
 * тем, что уже лежит.
 */
function keyBelongsTo(table: SyncedTable, rid: string, owner: string): boolean {
  switch (table) {
    case 'profile':
    case 'nutritionProfile':
      return rid === owner

    case 'nutritionDays':
    case 'dailyActivity': {
      const colon = rid.indexOf(':')
      return colon <= 0 || rid.slice(0, colon) === owner
    }

    case 'links':
      return !rid.startsWith('link-') || rid.endsWith(`-${owner}`)

    default:
      return true
  }
}

async function apply(rec: RemoteRecord): Promise<boolean> {
  if (!isSynced(rec.tbl)) return false
  const table = db.table(rec.tbl)

  const key = rec.rid
  if (!keyBelongsTo(rec.tbl, key, rec.owner)) return false
  const local = (await table.get(key)) as Record<string, unknown> | undefined

  /*
   * Строка, которую накрывает присланное, обязана принадлежать тому же
   * человеку, что и сама запись.
   *
   * Куда лечь, решает rid, а чья запись — owner, и связаны эти два поля ничем:
   * сервер видит их по отдельности и содержимого чужой базы не знает. Значит
   * клиент вправе прислать свою строку с ключом чужой — она ляжет поверх, — а
   * тумбстоуном (у него содержимого нет вовсе, и сверять нечего) просто
   * сотрёт её. Спрашиваем поэтому не присланное, а то, что уже лежит: оно про
   * подмену не врёт.
   */
  if (local) {
    const holder = await ownerOf(rec.tbl, local)
    if (holder !== rec.owner && !(holder === null && DERIVED_OWNER.includes(rec.tbl))) {
      return false
    }
  }

  if (rec.deleted) {
    if (!local) return false
    // Своя правка новее удаления — оставляем её. Иначе строка, которую
    // человек только что изменил и ещё не успел выгрузить, исчезает у него
    // из-под рук, а push её уже не найдёт: удалять нечего.
    if (Number.isFinite(rec.updated) && stampOf(local) > rec.updated) return false
    await table.delete(key)
    return true
  }

  if (!rec.payload || typeof rec.payload !== 'object') return false

  // Куда лечь, решает rid, а ложится payload — и если ключи расходятся,
  // строка накрывает чужую. Сервер этого не сверяет: он проверяет владельца
  // записи, а её содержимое считает делом автора. Значит любой может
  // прислать запись со своим owner и чужим id внутри — и подменить в базе
  // тренера его собственный профиль или данные другого клиента.
  const payload = rec.payload as Record<string, unknown>
  if (ridOf(rec.tbl, payload) !== rec.rid) return false

  /*
   * Владелец записи обязан совпадать с владельцем самой строки.
   *
   * Правило доступа на сервере отвечает только на вопрос «чья запись», а
   * содержимое считает делом автора. Значит клиент вправе создать запись со
   * своим owner, положив внутрь строку профиля тренера: ключ сойдётся с
   * содержимым, проверка выше пропустит, и на устройстве тренера его
   * собственный профиль окажется переписан. Сверяем тем же ownerOf, которым
   * выгрузка решает, кому строка принадлежит.
   *
   * Неопределимого владельца (родитель ещё не приехал, каталог общий) не
   * отбрасываем: иначе обмен встанет на строке, которая просто пришла раньше
   * своего родителя.
   */
  const owner = await ownerOf(rec.tbl, payload)
  if (owner && owner !== rec.owner) return false

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
        // Пометка объясняет, к чему файл: упражнение у видео техники,
        // день у скриншота дневника. Без неё запись на сервере безымянна.
        note: a.doc_kind ?? a.exercise_id ?? a.nutrition_date ?? a.task_id ?? '',
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
  if (!me || me.role !== 'trainer') {
    // У занимающегося чужих строк не бывает — знать про список некого,
    // и выгрузку это не блокирует.
    clientsKnown = true
    return 0
  }

  // Признак сбрасываем только при настоящем отказе. Обнулять его на время
  // запроса нельзя: обновление списка приходит и по событию из живого потока,
  // посреди работающей выгрузки, — и та обрывала бы проход, хотя список
  // с прошлого раза никуда не делся.
  let clients
  try {
    clients = await listClients(me.id)
  } catch (e) {
    clientsKnown = false
    throw e
  }
  rememberClients(clients.map((c) => c.id))
  clientsKnown = true

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
  if (!me || me.role === 'trainer') return false

  /*
   * Тренера спрашиваем у сервера, а не у сохранённой сессии.
   *
   * Тренер может отвязать клиента со своей стороны — тогда поле на сервере
   * пустеет, а в сессии на устройстве остаётся прежнее значение до
   * следующего входа. Клиент продолжал бы видеть раздел «Чат», сдавать
   * отчёты в пустоту и не смог бы подключить нового тренера.
   */
  const fresh = await getUser(me.id).catch(() => null)
  const trainerId = fresh ? ((fresh as { trainer?: string }).trainer ?? '') : me.trainer

  if (!trainerId) {
    // Связи больше нет — убираем и местную, иначе экраны продолжат
    // показывать тренера, которого уже нет.
    const stale = await db.links.where('client_id').equals(me.id).toArray()
    for (const l of stale) await db.links.delete(l.id)
    return stale.length > 0
  }

  const trainer = await getUser(trainerId)
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

  /*
   * Заводим связь, если на сервере она есть, а здесь её нет.
   *
   * Так бывает после переустановки, очистки хранилища или входа с другого
   * телефона: сервер помнит тренера, а устройство — нет. Без этой строки
   * человек попадал в тупик. Тренера он не видел — экраны читают связь, а
   * не поле в аккаунте. Отключить его не мог — кнопки без связи нет. И
   * ввести код нового тренера тоже не мог: проверка «тренер у клиента
   * один» смотрит на сервер и отказывает.
   *
   * Идентификатор выводится из пары, поэтому повторный проход ничего не
   * задваивает.
   */
  const id = linkId(trainer.id, me.id)
  if (!(await db.links.get(id))) {
    const ts = Date.now()
    await db.links.add({
      id,
      trainer_id: trainer.id,
      client_id: me.id,
      status: 'ACTIVE',
      initiated_by: 'TRAINER',
      created_at: ts,
      updated_at: ts,
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
/** Ссылки держим, чтобы снять их в stopSync: вход и выход за сессию могут
 *  случиться не раз, и каждый оставлял бы после себя ещё один обработчик. */
const kick = () => {
  void syncNow()
}
const onVisible = () => {
  if (document.visibilityState === 'visible') kick()
}

export function startSync() {
  if (timer) return
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
  document.addEventListener('visibilitychange', onVisible)
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

  const rec = e.record as unknown as RemoteRecord

  try {
    // Удаление идёт тем же путём, что и всё остальное: там сверяются метки,
    // и своя несохранённая правка не пропадёт из-за чужого удаления.
    await apply(e.action === 'delete' ? { ...rec, deleted: true } : rec)
  } catch {
    /* битое событие не должно ломать поток */
  }

  // Курсор по событию не двигаем, хотя серверная метка для этого и годится.
  // Поток рвётся незаметно, и при обрыве часть событий теряется: метка,
  // ушедшая вперёд по единственному дошедшему, навсегда закрывает от
  // страховочного опроса всё, что он должен был добрать. Лишний повтор
  // дешевле пропущенной записи, а повторное применение ничего не портит.
}

export function stopSync() {
  if (timer) clearInterval(timer)
  timer = null
  window.removeEventListener('online', kick)
  document.removeEventListener('visibilitychange', onVisible)
  closeRealtime()
}

/**
 * Первичная загрузка после входа: без неё человек, зашедший с нового
 * телефона, увидел бы пустое приложение и решил, что данные пропали.
 */
export async function initialPull(): Promise<void> {
  const user = authUser()
  if (!user) return
  await setCursors({ pulledSeq: 0 })
  await pull()
}
