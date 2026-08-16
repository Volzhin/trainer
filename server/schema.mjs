/**
 * Схема PocketBase как код.
 *
 * Скрипт идемпотентен: сравнивает то, что уже есть на сервере, с описанием
 * ниже и досылает разницу. Его гоняет деплой при каждом пуше, поэтому схема
 * живёт в репозитории, а не в кликах по админке — иначе она расходится с
 * приложением и её невозможно восстановить.
 *
 * Запуск: PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node server/schema.mjs
 */

const PB_URL = (process.env.PB_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '')
const EMAIL = process.env.PB_ADMIN_EMAIL
const PASSWORD = process.env.PB_ADMIN_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('Нужны PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD')
  process.exit(1)
}

/** Видео техники — самый тяжёлый файл, который загружает клиент. */
const MAX_UPLOAD = 64 * 1024 * 1024

/**
 * Вход обязателен — и это не формальность.
 *
 * У неавторизованного запроса @request.auth.id — пустая строка, а у клиента
 * без тренера пусто и поле trainer. Сравнение «пусто = пусто» истинно, и
 * условие вида owner.trainer = @request.auth.id пропускало наружу записи всех
 * клиентов, которые ещё не подключили тренера, — вместе с их профилями и
 * почтой, без всякого входа. Поэтому каждое правило начинается с проверки,
 * что запрос вообще от кого-то.
 */
const AUTHED = '@request.auth.id != ""'

/**
 * Доступ к данным клиента. Тренер видит и правит записи своих клиентов:
 * без этого он не сможет ни назначить программу, ни оставить обратную связь.
 * Связь односторонняя — поле trainer у клиента, поэтому одного условия хватает.
 */
const OWNER_OR_TRAINER =
  `${AUTHED} && (owner = @request.auth.id || owner.trainer = @request.auth.id)`

/**
 * То же самое для таблицы синхронизации, но с одним изъятием: заметки о
 * клиенте тренер ведёт для себя. Принадлежат они клиенту — иначе тренер не
 * нашёл бы их среди чужих записей, — и без этого условия клиент вычитывал бы
 * их обычным обменом и читал бы, что тренер о нём думает.
 */
const RECORDS_RULE =
  `${AUTHED} && ((owner = @request.auth.id && tbl != "trainerNotes")` +
  ' || owner.trainer = @request.auth.id)'

async function main() {
  const token = await login()
  const existing = await listCollections(token)
  const byName = new Map(existing.map((c) => [c.name, c]))

  const users = byName.get('users')
  if (!users) throw new Error('Коллекции users нет — база не инициализирована')

  await patchUsers(token, users)

  // Ссылки в relation-полях идут по id коллекции, поэтому users берём заново.
  const usersId = users.id

  await ensure(token, byName, {
    name: 'records',
    type: 'base',
    // Общее хранилище синхронизации. Приложение офлайн-первое: истина лежит
    // в Dexie на устройстве, сюда уезжают те же строки как есть, а разбор
    // конфликтов делает сравнение updated — кто новее, тот и прав.
    fields: [
      rel('owner', usersId, { required: true, cascadeDelete: true }),
      text('tbl', { required: true }),
      text('rid', { required: true }),
      num('updated', { required: true }),
      // Порядковая метка по часам сервера — очередь доставки. Ставится
      // хуком seq.pb.js, клиент её не присылает. Подробности там же.
      num('seq'),
      bool('deleted'),
      json('payload', 5 * 1024 * 1024),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_records_owner_tbl_rid` ON `records` (`owner`, `tbl`, `rid`)',
      'CREATE INDEX `idx_records_owner_updated` ON `records` (`owner`, `updated`)',
      'CREATE INDEX `idx_records_seq` ON `records` (`seq`)',
    ],
    listRule: RECORDS_RULE,
    viewRule: RECORDS_RULE,
    createRule: RECORDS_RULE,
    updateRule: RECORDS_RULE,
    deleteRule: RECORDS_RULE,
  })

  await ensure(token, byName, {
    name: 'attachments',
    type: 'base',
    // Видео техники и PDF отчётов. В records они не помещаются: там json,
    // а файл должен отдаваться потоком и кэшироваться браузером.
    fields: [
      rel('owner', usersId, { required: true, cascadeDelete: true }),
      text('rid', { required: true }),
      text('kind'),
      text('note'),
      // protected: без него файл отдаётся любому, кто знает ссылку. Правила
      // выше защищают запись о видео, но не само видео: адрес утекает через
      // историю браузера и пересылку и работает даже после разрыва связи с
      // тренером. С флагом ссылка требует одноразового токена (см. fileToken).
      {
        name: 'file',
        type: 'file',
        required: true,
        maxSelect: 1,
        maxSize: MAX_UPLOAD,
        protected: true,
      },
    ],
    indexes: ['CREATE INDEX `idx_attachments_owner` ON `attachments` (`owner`, `rid`)'],
    listRule: OWNER_OR_TRAINER,
    viewRule: OWNER_OR_TRAINER,
    createRule: OWNER_OR_TRAINER,
    updateRule: OWNER_OR_TRAINER,
    deleteRule: OWNER_OR_TRAINER,
  })

  await ensure(token, byName, {
    name: 'invites',
    type: 'base',
    // Код приглашения — то, как клиент попадает к тренеру. Читать код может
    // любой залогиненный: иначе его нельзя погасить, не зная владельца.
    fields: [
      text('code', { required: true }),
      rel('trainer', usersId, { required: true, cascadeDelete: true }),
      rel('client', usersId, {}),
      sel('status', ['PENDING', 'ACCEPTED', 'REVOKED']),
      num('expires'),
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_invites_code` ON `invites` (`code`)'],
    // Читать и править приглашения может только их автор. Клиент код не
    // ищет — он отдаёт его серверу, который сам находит нужную запись.
    // Иначе список кодов был бы доступен любому вошедшему целиком.
    listRule: `${AUTHED} && trainer = @request.auth.id`,
    viewRule: `${AUTHED} && trainer = @request.auth.id`,
    createRule: `${AUTHED} && trainer = @request.auth.id`,
    updateRule: `${AUTHED} && trainer = @request.auth.id`,
    deleteRule: `${AUTHED} && trainer = @request.auth.id`,
  })

  await applyLimits(token)
  await backfillSeq(token)

  console.log('Схема применена')
}

/**
 * Ограничение частоты запросов.
 *
 * Лимитер в PocketBase встроенный и держит счётчики в памяти процесса.
 * Отдельного хранилища вроде Redis не нужно: сервер один, а переживать его
 * перезапуск счётчикам незачем — после перезапуска и перебор начинается
 * заново, но его тут же ловит тот же лимитер.
 *
 * ВАЖНО ПРО АДРЕС КЛИЕНТА. Считает лимитер по адресу, а за nginx все запросы
 * приходят с адреса самого nginx. Без доверенного заголовка все пользователи
 * выглядят одним клиентом: двое вошли — третий получил отказ. Поэтому здесь
 * же настраивается trustedProxy, и включать лимиты можно только после того,
 * как в логах PocketBase видны разные адреса, а не один.
 */
async function applyLimits(token) {
  const current = await api(token, '/api/settings')

  const rules = [
    // Вход и смена пароля. Порог намеренно низкий: живой человек столько не
    // печатает, а перебору это ломает темп. Подбор одного адреса с разных
    // машин ловится отдельно — см. login-throttle.pb.js.
    { label: '*:auth', audience: '', duration: 5, maxRequests: 5 },
    // Погашение кода приглашения. Код короткий, поэтому перебор по нему
    // осмыслен, а живому человеку хватает одной попытки.
    { label: '/api/redeem', audience: '', duration: 60, maxRequests: 10 },
    // Отвязка клиента — редкое действие, частить незачем.
    { label: '/api/unlink', audience: '', duration: 60, maxRequests: 10 },
    { label: '*:create', audience: '', duration: 5, maxRequests: 20 },
    { label: '/api/batch', audience: '', duration: 1, maxRequests: 3 },
    // Общий потолок. Обмен шлёт запросы пачками, поэтому он щедрый: его
    // задача — не пустить откровенный поток, а не мешать синхронизации.
    { label: '/api/', audience: '', duration: 10, maxRequests: 300 },
  ]

  /*
   * Признак включения берётся из окружения, а не зашит здесь.
   *
   * Правила и доверенный заголовок безвредны сами по себе, а вот включение
   * лимитов при неверно определённом адресе клиента отрежет сразу всех.
   * Поэтому выкладка правил и их включение — два разных действия, и второе
   * делается, когда первое проверено на живом сервере.
   */
  const enabled = process.env.PB_RATE_LIMITS === 'on'

  await api(token, '/api/settings', 'PATCH', {
    trustedProxy: {
      // Заголовок ставит nginx. Если он его не ставит, PocketBase берёт
      // прямой адрес соединения — то есть хуже, чем сейчас, не станет.
      headers: ['X-Forwarded-For'],
      // Крайний левый адрес присылает клиент, и подделать его может кто
      // угодно. Берём ближайший к серверу — его подставляет наш же nginx.
      useLeftmostIP: false,
    },
    rateLimits: { ...current.rateLimits, rules, enabled },
  })

  console.log(`лимиты: правила обновлены, включены — ${enabled ? 'да' : 'нет'}`)
}

/**
 * Проставляет seq записям, лежавшим до его появления.
 *
 * Без этого они невидимы для нового устройства: оно начинает с нуля и
 * просит «всё, где seq больше нуля», а у старых записей его нет. То есть
 * человек, поставивший приложение заново, не получил бы свою историю.
 *
 * Идемпотентно: берёт только записи без seq, поэтому на следующем деплое
 * не делает ничего. Значение ставит хук — нам достаточно тронуть запись.
 */
async function backfillSeq(token) {
  let touched = 0
  let failed = 0
  // Страницу берём всегда первую: обработанные записи выпадают из выборки
  // сами, а листание по меняющемуся набору пропускает строки.
  for (let pass = 0; pass < 200; pass++) {
    // Только seq = 0: у числового поля незаполненное значение это ноль, а
    // сравнение с null PocketBase на таком поле разбирать не обязан — и
    // ошибка фильтра уронила бы весь шаг деплоя.
    const page = await api(
      token,
      '/api/collections/records/records?filter=' +
        encodeURIComponent('seq = 0') +
        '&perPage=200',
    )
    const items = page.items ?? []
    if (!items.length) break

    let progressed = false
    for (const row of items) {
      // seq выставит хук; сюда шлём поле, которое и так равно себе, чтобы
      // не менять данные и не сбить разрешение конфликтов по updated.
      try {
        await api(token, `/api/collections/records/records/${row.id}`, 'PATCH', {
          updated: row.updated,
        })
        touched++
        progressed = true
      } catch (e) {
        // Одна упрямая строка не должна валить деплой: остальные важнее,
        // а эта попадёт в следующий проход.
        failed++
        console.warn(`records: ${row.id} не обновился — ${e.message}`)
      }
    }

    // Ни одной не удалось — дальше проходы будут бесконечно брать ту же
    // страницу. Выходим, чтобы не крутиться впустую.
    if (!progressed) break
  }
  if (touched) console.log(`records: seq проставлен ${touched} записям`)
  if (failed) console.warn(`records: не удалось обновить ${failed} — повторим на следующем деплое`)
}

/** Профиль лежит прямо в auth-коллекции: так правила доступа умеют ходить
 *  по связи owner.trainer, а отдельная таблица профилей этого не позволяет. */
async function patchUsers(token, users) {
  const add = [
    sel('role', ['client', 'trainer']),
    rel('trainer', users.id, {}),
    num('height_cm'),
    num('goal_weight_kg'),
    text('experience'),
    text('specialization'),
    text('bio', { max: 2000 }),
    json('contacts', 64 * 1024),
    text('preferred_contact'),
    num('synced_at'),
  ]

  const have = new Set(users.fields.map((f) => f.name))
  const fields = [...users.fields, ...add.filter((f) => !have.has(f.name))]

  const body = {
    fields,
    // Регистрация открыта: приложение публичное, роль выбирается при входе.
    createRule: '',
    // Вход обязателен: у клиента без тренера поле trainer пусто, и без этой
    // проверки условие trainer = @request.auth.id совпадало для запроса
    // вообще без входа — список людей с почтами читал кто угодно.
    listRule:
      `${AUTHED} && (id = @request.auth.id || trainer = @request.auth.id` +
      ' || id = @request.auth.trainer)',
    viewRule:
      `${AUTHED} && (id = @request.auth.id || trainer = @request.auth.id` +
      ' || id = @request.auth.trainer)',
    // Свой профиль человек правит сам, но не привязку к тренеру: иначе весь
    // разбор кода приглашения обходится одним PATCH — достаточно знать id
    // тренера, чтобы попасть к нему в кабинет и получить доступ к его
    // карточке с почтой. Поле trainer меняет только обработчик /api/redeem:
    // он пишет запись напрямую, и правила доступа его не касаются.
    //
    // Роль под запрет не попадает намеренно: переключение режима — функция
    // приложения (см. AccountSection), а тренер без клиентов ничего чужого
    // не получает — доступ даёт поле trainer у клиента, а не своя роль.
    updateRule: 'id = @request.auth.id && @request.body.trainer:isset = false',
    deleteRule: 'id = @request.auth.id',
    passwordAuth: { enabled: true, identityFields: ['email'] },
  }

  await api(token, `/api/collections/${users.id}`, 'PATCH', body)
  console.log('users: поля профиля и правила доступа обновлены')
}

async function ensure(token, byName, def) {
  const current = byName.get(def.name)
  if (!current) {
    await api(token, '/api/collections', 'POST', def)
    console.log(`${def.name}: создана`)
    return
  }
  // Системные поля (id, created, updated) сервер добавляет сам — их нужно
  // сохранить, иначе PATCH их снесёт.
  const have = new Map(current.fields.map((f) => [f.name, f]))
  const merged = [...current.fields]
  for (const f of def.fields) if (!have.has(f.name)) merged.push(f)
  await api(token, `/api/collections/${current.id}`, 'PATCH', { ...def, fields: merged })
  console.log(`${def.name}: обновлена`)
}

const text = (name, o = {}) => ({ name, type: 'text', required: false, ...o })
const num = (name, o = {}) => ({ name, type: 'number', required: false, ...o })
const bool = (name) => ({ name, type: 'bool', required: false })
const json = (name, maxSize) => ({ name, type: 'json', required: false, maxSize })
const sel = (name, values) => ({ name, type: 'select', required: false, maxSelect: 1, values })
const rel = (name, collectionId, o = {}) => ({
  name,
  type: 'relation',
  required: false,
  collectionId,
  maxSelect: 1,
  cascadeDelete: false,
  ...o,
})

async function login() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  })
  if (!res.ok)
    throw new Error(`Вход администратора не удался: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

async function listCollections(token) {
  const res = await api(token, '/api/collections?perPage=200')
  return res.items
}

async function api(token, path, method = 'GET', body) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
