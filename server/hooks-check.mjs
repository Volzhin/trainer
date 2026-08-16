/**
 * Прогон обработчиков на местном PocketBase.
 *
 * Разыгрывает обмен тренера и клиента ровно теми запросами, что шлёт
 * приложение, и отдельно — попытки подмены, которые сервер обязан отбить.
 * В конце проверяет, что у всех записей стоит метка очереди `seq`.
 *
 * Зачем это вообще есть. Обработчик в PocketBase исполняется в отдельной
 * машине: на сервер уезжает исходник самой функции, а окружающий файл ей
 * недоступен. Вынесенный наружу помощник даёт `ReferenceError` не при
 * загрузке, а на каждом запросе — и сервер начинает отвечать отказом на любую
 * запись, от кого угодно. Одна такая правка остановила обмен у всех сразу и в
 * обе стороны; внешне это выглядело как «данные не доходят», и разобрались
 * только через час. Ошибка ловится этим прогоном за минуту.
 *
 * Запуск — см. «Проверка обработчиков» в DEPLOY.md.
 */

const URL = (process.env.PB_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '')
const EMAIL = process.env.PB_ADMIN_EMAIL ?? 'stand@local.test'
const PASSWORD = process.env.PB_ADMIN_PASSWORD

if (!PASSWORD) {
  console.error('Нужен PB_ADMIN_PASSWORD — пароль суперпользователя местного стенда')
  process.exit(1)
}

if (!/127\.0\.0\.1|localhost/.test(URL)) {
  // Прогон заводит людей и пишет записи. На живом сервере ему делать нечего.
  console.error(`Только на местном стенде, а не на ${URL}`)
  process.exit(1)
}

const req = async (path, init = {}, token) => {
  const headers = { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  if (token) headers.Authorization = token
  const res = await fetch(`${URL}${path}`, { ...init, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw Object.assign(new Error(data?.message ?? res.statusText), { status: res.status })
  }
  return data
}

const su = await req('/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
})

const PASS = 'stand-only-local-1'

const makeUser = async (email, role) => {
  const rec = await req(
    '/api/collections/users/records',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: PASS,
        passwordConfirm: PASS,
        name: email.split('@')[0],
        role,
      }),
    },
    su.token,
  )
  const auth = await req('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: email, password: PASS }),
  })
  return { id: rec.id, token: auth.token }
}

// Люди заводятся новые на каждый прогон: записи различаются владельцем, и
// повторный запуск не спотыкается об уникальный индекс (owner, tbl, rid).
const stamp = Date.now()
const T = await makeUser(`trainer${stamp}@local.test`, 'trainer')
const C = await makeUser(`client${stamp}@local.test`, 'client')

// Поле trainer правит только обработчик /api/redeem, поэтому связь ставим
// от суперпользователя — приглашение здесь не проверяется.
await req(
  `/api/collections/users/records/${C.id}`,
  { method: 'PATCH', body: JSON.stringify({ trainer: T.id }) },
  su.token,
)

let failures = 0
const ts = Date.now()

/** Отправляет запись и сверяет исход с ожидаемым. */
const send = async (who, label, row, expect = 'ok') => {
  let got = 'ok'
  let why = ''
  try {
    await req('/api/collections/records/records', { method: 'POST', body: JSON.stringify(row) }, who.token)
  } catch (e) {
    got = 'отказ'
    why = ` — ${e.status} ${e.message}`
  }
  const good = got === expect
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}: ${got}${why}`)
}

/** Правит уже лежащую запись и сверяет исход с ожидаемым. */
const edit = async (who, label, id, body, expect = 'ok') => {
  let got = 'ok'
  let why = ''
  try {
    await req(
      `/api/collections/records/records/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      who.token,
    )
  } catch (e) {
    got = 'отказ'
    why = ` — ${e.status} ${e.message}`
  }
  const good = got === expect
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}: ${got}${why}`)
}

console.log('\nТренер выгружает своё и клиентское:')
await send(T, 'profile', {
  owner: T.id, tbl: 'profile', rid: T.id, updated: ts,
  payload: { id: T.id, name: 'Тренер', role: 'TRAINER' },
})
await send(T, 'links', {
  owner: C.id, tbl: 'links', rid: 'l-1', updated: ts,
  payload: { id: 'l-1', trainer_id: T.id, client_id: C.id, status: 'ACTIVE' },
})
await send(T, 'programs (копия под клиента)', {
  owner: C.id, tbl: 'programs', rid: 'pr-1', updated: ts,
  payload: { id: 'pr-1', client_id: C.id, author_id: T.id, source_id: 'prog-1', title: 'Push/Pull/Legs' },
})
await send(T, 'routines', {
  owner: C.id, tbl: 'routines', rid: 'rt-1', updated: ts,
  payload: { id: 'rt-1', program_id: 'pr-1', day_order: 0, title: 'Push' },
})
await send(T, 'templateItems', {
  owner: C.id, tbl: 'templateItems', rid: 'ti-1', updated: ts,
  payload: { id: 'ti-1', routine_id: 'rt-1', exercise_id: 'ex-1', sequence_order: 0 },
})
await send(T, 'assignments', {
  owner: C.id, tbl: 'assignments', rid: 'as-1', updated: ts,
  payload: { id: 'as-1', trainer_id: T.id, client_id: C.id, program_id: 'pr-1', status: 'ACTIVE' },
})
await send(T, 'chat (сообщение тренера)', {
  owner: C.id, tbl: 'chat', rid: 'ch-1', updated: ts,
  payload: {
    id: 'ch-1', thread_id: 'th', trainer_id: T.id, client_id: C.id,
    author_id: T.id, author_role: 'TRAINER', kind: 'text', text: 'привет', is_read: 0,
  },
})
await send(T, 'tasks', {
  owner: C.id, tbl: 'tasks', rid: 'tk-1', updated: ts,
  payload: { id: 'tk-1', client_id: C.id, trainer_id: T.id, kind: 'text', status: 'OPEN' },
})
await send(T, 'nutritionTargets', {
  owner: C.id, tbl: 'nutritionTargets', rid: 'nt-1', updated: ts,
  payload: { id: 'nt-1', client_id: C.id, kcal: 2000 },
})
await send(T, 'reviews', {
  owner: T.id, tbl: 'reviews', rid: 'rv-1', updated: ts,
  payload: { id: 'rv-1', trainer_id: T.id, client_id: C.id, target: 'report', ref_id: 'x' },
})

console.log('\nКлиент выгружает своё:')
await send(C, 'profile', {
  owner: C.id, tbl: 'profile', rid: C.id, updated: ts,
  payload: { id: C.id, name: 'Клиент', role: 'CLIENT' },
})
await send(C, 'chat (сообщение клиента)', {
  owner: C.id, tbl: 'chat', rid: 'ch-2', updated: ts,
  payload: {
    id: 'ch-2', thread_id: 'th', trainer_id: T.id, client_id: C.id,
    author_id: C.id, author_role: 'CLIENT', kind: 'text', text: 'ответ', is_read: 0,
  },
})
await send(C, 'sessions', {
  owner: C.id, tbl: 'sessions', rid: 'se-1', updated: ts,
  payload: { id: 'se-1', user_id: C.id, title: 'Push', is_completed: 1, start_time: ts },
})
await send(C, 'sets', {
  owner: C.id, tbl: 'sets', rid: 'st-1', updated: ts,
  payload: { id: 'st-1', workout_session_id: 'se-1', weight: 50, reps: 10 },
})
await send(C, 'workoutReports', {
  owner: C.id, tbl: 'workoutReports', rid: 'wr-1', updated: ts,
  payload: { id: 'wr-1', client_id: C.id, user_id: C.id, status: 'SUBMITTED' },
})

// Отметку «прочитано» ставит не автор сообщения — правка чужой строки должна
// проходить, пока подпись и текст в ней не меняются.
console.log('\nТренер отмечает сообщение клиента прочитанным:')
const found = await req(
  `/api/collections/records/records?filter=${encodeURIComponent('tbl="chat" && rid="ch-2"')}`,
  {},
  T.token,
).catch(() => ({ items: [] }))

if (!found.items.length) {
  failures++
  console.log('  ✗ сообщение клиента тренеру не видно вовсе')
} else {
  const rec = found.items[0]
  try {
    await req(
      `/api/collections/records/records/${rec.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          owner: C.id, tbl: 'chat', rid: 'ch-2', updated: ts + 1000,
          payload: { ...rec.payload, is_read: 1 },
        }),
      },
      T.token,
    )
    console.log('  ✓ отметка «прочитано»: ok')
  } catch (e) {
    failures++
    console.log(`  ✗ отметка «прочитано»: отказ — ${e.status} ${e.message}`)
  }
}

console.log('\nПопытки подмены (ждём отказа):')
await send(C, 'профиль тренера под своим owner', {
  owner: C.id, tbl: 'profile', rid: T.id, updated: ts + 2000,
  payload: { id: T.id, name: 'Взломано', role: 'TRAINER' },
}, 'отказ')
await send(C, 'ключ записи не совпадает с содержимым', {
  owner: C.id, tbl: 'sessions', rid: 'se-9', updated: ts + 2000,
  payload: { id: 'se-1', user_id: C.id, title: 'подмена' },
}, 'отказ')
await send(C, 'сообщение от имени тренера', {
  owner: C.id, tbl: 'chat', rid: 'ch-9', updated: ts + 2000,
  payload: {
    id: 'ch-9', thread_id: 'th', trainer_id: T.id, client_id: C.id,
    author_id: T.id, author_role: 'TRAINER', kind: 'text', text: 'я такого не писал', is_read: 0,
  },
}, 'отказ')
await send(C, 'назначение другому человеку', {
  owner: C.id, tbl: 'assignments', rid: 'as-9', updated: ts + 2000,
  payload: { id: 'as-9', trainer_id: T.id, client_id: T.id, program_id: 'pr-1', status: 'ACTIVE' },
}, 'отказ')

/*
 * Адрес строки в чужой базе — это тройка «владелец, таблица, ключ», и после
 * создания она не меняется.
 *
 * Правило доступа на правку проверяет запись ДО изменения: свою она находит и
 * пропускает, а что PATCH переписывает владельца на тренера, правило уже не
 * смотрит. Одним запросом клиент переносит свою запись на любой адрес — вместе
 * с любым содержимым, и обе проверки содержимого при этом сходятся, потому что
 * владельца он подставил сам. Обмен так не делает никогда: upsertRecord ищет
 * запись как раз по этой тройке и дописывает только updated, deleted и payload.
 */
console.log('\nПеренос своей записи на чужой адрес (ждём отказа):')
const own = await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: C.id, tbl: 'sessions', rid: 'se-move', updated: ts,
      payload: { id: 'se-move', user_id: C.id, title: 'моя' },
    }),
  },
  C.token,
)
// Адрес взят такой, какого на сервере ещё нет: иначе отказ пришёл бы от
// уникального индекса (owner, tbl, rid), а не от проверки, ради которой всё.
await edit(C, 'смена владельца на тренера', own.id, {
  owner: T.id, tbl: 'nutritionProfile', rid: T.id, updated: ts + 3000,
  payload: { id: T.id, kcal: 1, protein_g: 1 },
}, 'отказ')
await edit(C, 'смена ключа у своей записи', own.id, {
  rid: 'se-other', updated: ts + 3000,
  payload: { id: 'se-other', user_id: C.id, title: 'моя' },
}, 'отказ')
await edit(C, 'смена таблицы у своей записи', own.id, {
  tbl: 'bodyMetrics', updated: ts + 3000,
  payload: { id: 'se-move', user_id: C.id, weight_kg: 1 },
}, 'отказ')
await edit(C, 'своя правка по тому же адресу', own.id, {
  owner: C.id, tbl: 'sessions', rid: 'se-move', updated: ts + 4000,
  payload: { id: 'se-move', user_id: C.id, title: 'поправил' },
})

/*
 * Ключ, в котором записан его владелец.
 *
 * Тумбстоун приезжает без содержимого, и сверять с payload нечего — но у части
 * таблиц владелец записан в самом ключе: профиль лежит под идентификатором
 * человека, день питания и шаги — под «человек:дата», связь — под
 * «link-тренер-клиент». По такому ключу получатель и читает. Значит удаление
 * по чужому ключу стирает у тренера его собственную строку, а обычная запись
 * подменяет её — и то и другое сервер обязан отбить, не заглядывая в payload.
 */
console.log('\nЧужой ключ там, где ключ выводится из человека (ждём отказа):')
await send(C, 'тумбстоун профиля тренера', {
  owner: C.id, tbl: 'profile', rid: T.id, updated: ts + 3000, deleted: true, payload: null,
}, 'отказ')
await send(C, 'тумбстоун профиля питания тренера', {
  owner: C.id, tbl: 'nutritionProfile', rid: T.id, updated: ts + 3000, deleted: true, payload: null,
}, 'отказ')
await send(C, 'тумбстоун чужой связи', {
  owner: C.id, tbl: 'links', rid: `link-${T.id}-${T.id}`, updated: ts + 3000,
  deleted: true, payload: null,
}, 'отказ')
await send(C, 'день питания тренера под своим содержимым', {
  owner: C.id, tbl: 'nutritionDays', rid: `${T.id}:2026-01-01`, updated: ts + 3000,
  payload: { id: `${T.id}:2026-01-01`, user_id: C.id, date: '2026-01-01', status: 'DRAFT' },
}, 'отказ')
await send(C, 'шаги тренера под своим содержимым', {
  owner: C.id, tbl: 'dailyActivity', rid: `${T.id}:2026-01-01`, updated: ts + 3000,
  payload: { id: `${T.id}:2026-01-01`, user_id: C.id, date: '2026-01-01', steps: 0 },
}, 'отказ')

console.log('\nСвои ключи тех же таблиц (ждём приёма):')
await send(C, 'свой день питания', {
  owner: C.id, tbl: 'nutritionDays', rid: `${C.id}:2026-01-01`, updated: ts + 3000,
  payload: { id: `${C.id}:2026-01-01`, user_id: C.id, date: '2026-01-01', status: 'DRAFT' },
})
await send(C, 'свои шаги', {
  owner: C.id, tbl: 'dailyActivity', rid: `${C.id}:2026-01-01`, updated: ts + 3000,
  payload: { id: `${C.id}:2026-01-01`, user_id: C.id, date: '2026-01-01', steps: 1000 },
})
const myLink = await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: C.id, tbl: 'links', rid: `link-${T.id}-${C.id}`, updated: ts + 3000,
      payload: {
        id: `link-${T.id}-${C.id}`, trainer_id: T.id, client_id: C.id, status: 'ACTIVE',
      },
    }),
  },
  C.token,
).then((r) => { console.log('  ✓ своя связь с тренером: ok'); return r })
  .catch((e) => { failures++; console.log(`  ✗ своя связь с тренером: отказ — ${e.status} ${e.message}`); return null })
if (myLink) {
  await edit(C, 'тумбстоун своей связи', myLink.id, {
    updated: ts + 4000, deleted: true, payload: null,
  })
}

/*
 * Приглашения: код ведёт туда, откуда его выписали.
 *
 * Обработчик /api/redeem верит полю trainer в записи приглашения — кого оно
 * указывает, того он и показывает клиенту с контактами и документами, к тому
 * и привязывает. Значит, само поле после выпуска меняться не должно: правило
 * «приглашение правит его автор» проверяет запись ДО изменения, и без запрета
 * автор своего же кода переводит стрелку на любого человека по
 * идентификатору — и получает его карточку, а следом и профиль как «своего
 * тренера». Проверяем и запрет, и исход: даже если поле как-то сменилось,
 * чужая карточка отдаваться не должна.
 */
console.log('\nПриглашения:')

const code6 = (n) => `H${n.toString(36).toUpperCase().slice(-4)}${Math.floor(Math.random() * 9)}`

const VIC = await makeUser(`victim-card${stamp}@local.test`, 'client')
const ADV = await makeUser(`hijacker${stamp}@local.test`, 'client')

// Личные контакты — ровно то, ради чего чужую карточку и запрашивают.
await req(
  `/api/collections/users/records/${VIC.id}`,
  {
    method: 'PATCH',
    body: JSON.stringify({
      contacts: [{ kind: 'phone', value: '+79990000000' }],
      preferred_contact: 'phone',
    }),
  },
  VIC.token,
)

const hijackCode = code6(stamp)
const mine = await req(
  '/api/collections/invites/records',
  {
    method: 'POST',
    body: JSON.stringify({
      code: hijackCode,
      trainer: ADV.id,
      status: 'PENDING',
      expires: Date.now() + 86400_000,
    }),
  },
  ADV.token,
)

let repointed = true
try {
  await req(
    `/api/collections/invites/records/${mine.id}`,
    { method: 'PATCH', body: JSON.stringify({ trainer: VIC.id }) },
    ADV.token,
  )
} catch {
  repointed = false
}
if (repointed) failures++
console.log(
  `  ${repointed ? '✗' : '✓'} перевод своего кода на постороннего: ${repointed ? 'прошёл' : 'отказ'}`,
)

let leaked = ''
try {
  const card = await req(
    '/api/redeem',
    { method: 'POST', body: JSON.stringify({ code: hijackCode, peek: true }) },
    ADV.token,
  )
  if (card.trainer?.id === VIC.id) leaked = JSON.stringify(card.trainer)
} catch {
  /* отказ — то, что нужно */
}
if (leaked) failures++
console.log(`  ${leaked ? '✗' : '✓'} карточка постороннего по своему коду: ${leaked || 'не отдана'}`)

try {
  await req('/api/redeem', { method: 'POST', body: JSON.stringify({ code: hijackCode }) }, ADV.token)
} catch {
  /* отказ — то, что нужно */
}
const advNow = await req(`/api/collections/users/records/${ADV.id}`, {}, su.token)
const bound = advNow.trainer === VIC.id
if (bound) failures++
console.log(`  ${bound ? '✗' : '✓'} привязка к постороннему: ${bound ? 'состоялась' : 'нет'}`)

// Отзыв кода — обычный PATCH статуса — обязан продолжать работать: запрет
// касается только того, на кого код указывает.
try {
  await req(
    `/api/collections/invites/records/${mine.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'REVOKED' }) },
    ADV.token,
  )
  console.log('  ✓ отзыв своего кода: ok')
} catch (e) {
  failures++
  console.log(`  ✗ отзыв своего кода: отказ — ${e.status} ${e.message}`)
}

// Задуманное поведение: карточку тренера видно до согласия, и peek код не
// гасит — иначе передумавший остался бы без кода и без тренера.
const JOIN = await makeUser(`joiner${stamp}@local.test`, 'client')
const joinCode = code6(stamp + 7)
await req(
  '/api/collections/invites/records',
  {
    method: 'POST',
    body: JSON.stringify({
      code: joinCode,
      trainer: T.id,
      status: 'PENDING',
      expires: Date.now() + 86400_000,
    }),
  },
  T.token,
)
try {
  const first = await req(
    '/api/redeem',
    { method: 'POST', body: JSON.stringify({ code: joinCode, peek: true }) },
    JOIN.token,
  )
  const again = await req(
    '/api/redeem',
    { method: 'POST', body: JSON.stringify({ code: joinCode, peek: true }) },
    JOIN.token,
  )
  const good = first.trainer?.id === T.id && again.trainer?.id === T.id
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} peek отдаёт карточку тренера и не гасит код`)
} catch (e) {
  failures++
  console.log(`  ✗ peek отдаёт карточку тренера и не гасит код: ${e.status} ${e.message}`)
}
try {
  await req('/api/redeem', { method: 'POST', body: JSON.stringify({ code: joinCode }) }, JOIN.token)
  const joined = await req(`/api/collections/users/records/${JOIN.id}`, {}, su.token)
  const good = joined.trainer === T.id
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} погашение по своему коду привязывает к тренеру`)
} catch (e) {
  failures++
  console.log(`  ✗ погашение по своему коду привязывает к тренеру: ${e.status} ${e.message}`)
}

/*
 * Разрыв связи: /api/unlink.
 *
 * Поле trainer в записи клиента — единственное, на чём держится доступ
 * тренера ко всем его данным. Значит, обработчик, который это поле снимает,
 * обязан отличать своего клиента от чужого по идентификатору из запроса, а не
 * верить ему: отвязав постороннего, человек и лишает его тренера доступа, и
 * освобождает место под себя.
 *
 * Отдельно проверяем ответы. Обработчик отвечает и на чужие идентификаторы, а
 * значит, разные коды ответа сами по себе рассказывают о посторонних людях:
 * есть ли такой человек и завёл ли он тренера. Бывший тренер идентификатор
 * клиента помнит всегда — и по коду ответа узнавал бы, ушёл ли тот к другому.
 */
console.log('\nРазрыв связи:')

const OTHER = await makeUser(`other-coach${stamp}@local.test`, 'trainer')
const LONE = await makeUser(`lone${stamp}@local.test`, 'client')

/** Зовёт /api/unlink и возвращает код ответа. `who` без токена — без входа. */
const unlink = async (who, body) => {
  try {
    await req('/api/unlink', { method: 'POST', body: JSON.stringify(body) }, who?.token)
    return 200
  } catch (e) {
    return e.status
  }
}
const trainerOf = async (id) => (await req(`/api/collections/users/records/${id}`, {}, su.token)).trainer
const unlinkCheck = (label, good, note = '') => {
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}${note ? `: ${note}` : ''}`)
}

const foreign = await unlink(OTHER, { client: C.id })
unlinkCheck('чужой тренер не отвязывает клиента', (await trainerOf(C.id)) === T.id, `ответ ${foreign}`)
const stranger = await unlink(LONE, { client: C.id })
unlinkCheck('посторонний не отвязывает клиента', (await trainerOf(C.id)) === T.id, `ответ ${stranger}`)
const anon = await unlink(null, { client: C.id })
unlinkCheck('без входа — отказ', anon === 401, `ответ ${anon}`)

// Три чужих идентификатора: которого нет, который без тренера и который под
// чужим тренером. Ответ обязан быть один и тот же — иначе это перебор.
const noSuch = await unlink(OTHER, { client: 'zzzzzzzzzzzzzzz' })
const noTrainer = await unlink(OTHER, { client: LONE.id })
const foreignAgain = await unlink(OTHER, { client: C.id })
unlinkCheck(
  'ответ на чужой идентификатор не выдаёт, кто есть в системе',
  noSuch === noTrainer && noTrainer === foreignAgain,
  `нет такого — ${noSuch}, без тренера — ${noTrainer}, чужой — ${foreignAgain}`,
)

// Задуманное поведение обеих сторон. Заодно смотрим, что снялось только поле
// связи: обработчик пишет чужую запись мимо правил доступа, и лишняя правка в
// ней прошла бы незамеченной.
const beforeUnlink = await req(`/api/collections/users/records/${C.id}`, {}, su.token)
const byTrainer = await unlink(T, { client: C.id })
const afterUnlink = await req(`/api/collections/users/records/${C.id}`, {}, su.token)
unlinkCheck('тренер отвязывает своего клиента', byTrainer === 200 && !afterUnlink.trainer, `ответ ${byTrainer}`)
const touched = Object.keys(afterUnlink).filter(
  (k) => k !== 'trainer' && k !== 'updated' && JSON.stringify(afterUnlink[k]) !== JSON.stringify(beforeUnlink[k]),
)
unlinkCheck('кроме связи ничего не изменилось', !touched.length, touched.join(', ') || 'только trainer')

await req(
  `/api/collections/users/records/${C.id}`,
  { method: 'PATCH', body: JSON.stringify({ trainer: T.id }) },
  su.token,
)
const bySelf = await unlink(C, {})
unlinkCheck('клиент отвязывает себя', bySelf === 200 && !(await trainerOf(C.id)), `ответ ${bySelf}`)
// Повторный вызов клиента не должен падать: экран зовёт отвязку и после
// того, как связь уже снята с другой стороны.
const again = await unlink(C, {})
unlinkCheck('повторная отвязка себя не падает', again === 200, `ответ ${again}`)

/*
 * Регистрация не назначает тренера.
 *
 * Поле trainer держит на себе весь доступ тренера к данным клиента, и правка
 * его запрещена правилом — но заводится аккаунт тем же телом, а создание
 * никакого правила не имело вовсе. Любой заводил себе аккаунт, указав в
 * trainer чужой идентификатор, и без всякого приглашения получал карточку
 * этого человека (почта, телефон, телеграм), место в его списке клиентов и
 * право положить ему в кабинет свои записи — переписку в том числе. Причём
 * годился любой идентификатор, не только тренерский: «тренером» назначался и
 * обычный клиент, и его карточка отдавалась так же.
 *
 * Здесь же — то, что ломать нельзя: регистрация остаётся открытой, тренер
 * видит своих клиентов, клиент — карточку своего тренера.
 */
console.log('\nРегистрация и видимость профилей:')

/** Регистрация ровно так, как её шлёт приложение, — без токена. */
const signup = async (email, extra = {}) => {
  try {
    const rec = await req('/api/collections/users/records', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: PASS,
        passwordConfirm: PASS,
        name: email.split('@')[0],
        role: 'client',
        ...extra,
      }),
    })
    return { id: rec.id, status: 200 }
  } catch (e) {
    return { id: '', status: e.status }
  }
}

const signupCheck = (label, good, note = '') => {
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}${note ? `: ${note}` : ''}`)
}

const CARD = await makeUser(`card-owner${stamp}@local.test`, 'trainer')
await req(
  `/api/collections/users/records/${CARD.id}`,
  {
    method: 'PATCH',
    body: JSON.stringify({
      contacts: [{ kind: 'telegram', value: '@private' }],
      preferred_contact: 'telegram',
    }),
  },
  CARD.token,
)

const preset = await signup(`preset${stamp}@local.test`, { trainer: CARD.id })
const presetTrainer = preset.id
  ? (await req(`/api/collections/users/records/${preset.id}`, {}, su.token)).trainer
  : ''
signupCheck(
  'аккаунт с чужим тренером не заводится',
  !presetTrainer,
  `ответ ${preset.status}, trainer=${presetTrainer || 'пусто'}`,
)

// Даже если поле как-то проставилось, карточка постороннего отдаваться не
// должна: проверяем исход, а не только запрет.
let presetSaw = ''
if (preset.id) {
  const auth = await req('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: `preset${stamp}@local.test`, password: PASS }),
  })
  try {
    const card = await req(`/api/collections/users/records/${CARD.id}`, {}, auth.token)
    presetSaw = `${card.email ?? ''} ${JSON.stringify(card.contacts ?? '')}`
  } catch {
    /* отказ — то, что нужно */
  }
}
signupCheck('новичок не читает карточку постороннего', !presetSaw, presetSaw || 'не отдана')

// Регистрация публичная — она обязана работать и после запрета.
const plain = await signup(`plain${stamp}@local.test`)
signupCheck('обычная регистрация проходит', plain.status === 200, `ответ ${plain.status}`)

// Тренеру нужен список клиентов, клиенту — карточка тренера. На этом держатся
// listClients и syncMyTrainer в приложении.
const COACH = await makeUser(`coach-view${stamp}@local.test`, 'trainer')
const PUPIL = await makeUser(`pupil-view${stamp}@local.test`, 'client')
await req(
  `/api/collections/users/records/${PUPIL.id}`,
  { method: 'PATCH', body: JSON.stringify({ trainer: COACH.id }) },
  su.token,
)
const asList = async (who, filter) => {
  try {
    const res = await req(
      `/api/collections/users/records?filter=${encodeURIComponent(filter)}&perPage=200`,
      {},
      who.token,
    )
    return res.items.map((i) => i.id)
  } catch {
    return []
  }
}
signupCheck(
  'тренер видит своих клиентов',
  (await asList(COACH, `trainer="${COACH.id}"`)).includes(PUPIL.id),
)
let coachCard = null
try {
  coachCard = await req(`/api/collections/users/records/${COACH.id}`, {}, PUPIL.token)
} catch {
  /* останется null — это провал */
}
signupCheck('клиент видит карточку своего тренера', !!coachCard?.name)
let outsider = ''
try {
  const seen = await req(`/api/collections/users/records/${PUPIL.id}`, {}, CARD.token)
  outsider = seen.id
} catch {
  /* отказ — то, что нужно */
}
signupCheck('посторонний тренер не видит чужого клиента', !outsider)

/*
 * Вложения: чужой файл по подменённому идентификатору.
 *
 * Здесь лежат видео техники и фотографии «до/после» — человек снимает себя в
 * белье, — поэтому промах в правах тут стоит не строки в базе, а фотографии
 * живого человека. Идентификатор владельца приходит от клиента: приложение
 * само кладёт owner в тело загрузки, а запись потом правится по её id. Значит
 * проверять надо оба конца — и кому файл кладут, и кому он достаётся.
 *
 * Отдельно про перевод owner у собственной записи. Правило доступа при правке
 * смотрит на запись ДО изменения: своё вложение владелец пройти вправе, и без
 * запрета он тем же PATCH переписывает owner на любого человека по
 * идентификатору. Файл целиком уезжает в чужой кабинет — посторонний видит его
 * у себя в списке и качает, а заодно это способ забить чужой аккаунт роликами
 * по 64 МБ. Ровно так же однажды переводились приглашения (см. invites) и
 * привязка к тренеру (см. users) — грабли те же, поле другое.
 */
console.log('\nВложения:')

const attachCheck = (label, good, note = '') => {
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}${note ? `: ${note}` : ''}`)
}

/** Загрузка ровно тем же телом, что шлёт uploadAttachment в приложении. */
const putFile = async (who, owner, body = 'секретное фото', kind = 'photo', note = '') => {
  const form = new FormData()
  form.append('owner', owner)
  form.append('rid', `att-${Math.random().toString(36).slice(2, 8)}`)
  form.append('kind', kind)
  if (note) form.append('note', note)
  form.append('file', new Blob([body], { type: 'image/jpeg' }), 'photo.jpg')
  const res = await fetch(`${URL}/api/collections/attachments/records`, {
    method: 'POST',
    headers: { Authorization: who.token },
    body: form,
  })
  const text = await res.text()
  return { status: res.status, rec: res.ok && text ? JSON.parse(text) : null }
}

/**
 * Скачивание защищённого файла: сначала токен, потом ссылка. Ответ читаем
 * сырым — тело тут не json, и общий помощник на нём споткнулся бы.
 */
const getFile = async (who, rec) => {
  let token = ''
  if (who) {
    const issued = await req('/api/files/token', { method: 'POST' }, who.token).catch(() => null)
    token = issued?.token ?? ''
  }
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  const res = await fetch(`${URL}/api/files/attachments/${rec.id}/${rec.file}${query}`)
  return { status: res.status, body: res.ok ? await res.text() : '' }
}

const ACOACH = await makeUser(`att-coach${stamp}@local.test`, 'trainer')
const AOWNER = await makeUser(`att-owner${stamp}@local.test`, 'client')
const AOUT = await makeUser(`att-outsider${stamp}@local.test`, 'client')
await req(
  `/api/collections/users/records/${AOWNER.id}`,
  { method: 'PATCH', body: JSON.stringify({ trainer: ACOACH.id }) },
  su.token,
)

// Задуманное поведение: своё грузится, документ тренера своему клиенту тоже,
// и тренер потом свой же файл читает.
const ownFile = await putFile(AOWNER, AOWNER.id)
attachCheck('клиент грузит своё вложение', ownFile.status === 200, `ответ ${ownFile.status}`)
const doc = await putFile(ACOACH, AOWNER.id, 'документ тренера')
attachCheck('тренер кладёт документ своему клиенту', doc.status === 200, `ответ ${doc.status}`)
const byCoach = await getFile(ACOACH, ownFile.rec)
attachCheck('тренер качает файл своего клиента', byCoach.status === 200, `ответ ${byCoach.status}`)

// Подмена owner на загрузке: посторонний кладёт файл в чужое пространство.
const spoof = await putFile(AOUT, AOWNER.id)
attachCheck('посторонний не грузит файл на чужой owner', spoof.status !== 200, `ответ ${spoof.status}`)

let sawRecord = ''
try {
  const rec = await req(`/api/collections/attachments/records/${ownFile.rec.id}`, {}, AOUT.token)
  sawRecord = `${rec.file} ${rec.note ?? ''}`
} catch {
  /* отказ — то, что нужно */
}
attachCheck('посторонний не читает чужую запись вложения', !sawRecord, sawRecord || 'не отдана')

const stolen = await getFile(AOUT, ownFile.rec)
attachCheck('посторонний не качает чужой файл', stolen.status !== 200, `ответ ${stolen.status}`)
const noToken = await getFile(null, ownFile.rec)
attachCheck('без токена файл не отдаётся', noToken.status !== 200, `ответ ${noToken.status}`)

// Перевод собственного вложения на постороннего.
let moved = 0
try {
  await req(
    `/api/collections/attachments/records/${ownFile.rec.id}`,
    { method: 'PATCH', body: JSON.stringify({ owner: AOUT.id }) },
    AOWNER.token,
  )
  moved = 200
} catch (e) {
  moved = e.status
}
attachCheck('владелец не переводит своё вложение на постороннего', moved !== 200, `ответ ${moved}`)

// Исход важнее запрета: даже если поле как-то сменилось, чужой человек не
// должен ни видеть запись у себя, ни получить файл.
const outList = await req('/api/collections/attachments/records?perPage=200', {}, AOUT.token)
  .catch(() => ({ items: [] }))
const planted = outList.items.some((i) => i.id === ownFile.rec.id)
attachCheck('подложенного вложения нет в списке постороннего', !planted)
const afterMove = await getFile(AOUT, ownFile.rec)
attachCheck('посторонний не качает подложенное', afterMove.status !== 200, `ответ ${afterMove.status}`)

// Запрет касается только поля владельца: обычная правка вложения ломаться не
// должна, иначе «нельзя переставить owner» незаметно превратится в «нельзя
// править вовсе», и следующая же пометка к файлу не сохранится.
let noted = 0
try {
  await req(
    `/api/collections/attachments/records/${ownFile.rec.id}`,
    { method: 'PATCH', body: JSON.stringify({ note: 'подписал' }) },
    AOWNER.token,
  )
  noted = 200
} catch (e) {
  noted = e.status
}
attachCheck('владелец правит пометку у своего вложения', noted === 200, `ответ ${noted}`)

// Удаление своего вложения обязано работать — им пользуется приложение.
let removed = 0
try {
  await req(`/api/collections/attachments/records/${doc.rec.id}`, { method: 'DELETE' }, AOWNER.token)
  removed = 200
} catch (e) {
  removed = e.status
}
attachCheck('владелец удаляет своё вложение', removed === 200, `ответ ${removed}`)

/*
 * Документы тренера до привязки — то, ради чего изъятие в viewRule и заведено.
 *
 * Оферту и согласие человек подписывает ДО того, как стал клиентом, а прав на
 * чужие записи у него в этот момент нет никаких. Дважды сломанное место:
 * список документов приходил пустым (запрос падал на сортировке по полю,
 * которого у коллекции нет, а catch подменял ошибку пустотой), и даже с
 * непустым списком открыть файл было нельзя. Человек видел «документов нет» и
 * подписывал пустоту — при живых документах на сервере.
 *
 * Проверяем поэтому обе половины сразу: что документы доезжают в ответе на код
 * и что по ним отдаётся файл. И границу изъятия: всё, что не kind="document",
 * постороннему по-прежнему закрыто.
 */
console.log('\nДокументы тренера перед подключением:')

const DCOACH = await makeUser(`doc-coach${stamp}@local.test`, 'trainer')
const DFUT = await makeUser(`doc-future${stamp}@local.test`, 'client')

const DOCTEXT = 'СОГЛАСИЕ НА ОБРАБОТКУ'
const docFile = await putFile(DCOACH, DCOACH.id, DOCTEXT, 'document', 'personal_data')
attachCheck('тренер прикладывает документ', docFile.status === 200, `ответ ${docFile.status}`)
// Не документ, того же владельца: граница изъятия проходит по kind, а не по
// тому, чей это файл.
const coachPhoto = await putFile(DCOACH, DCOACH.id, 'личное фото тренера', 'photo')

const docCode = code6(stamp + 21)
await req(
  '/api/collections/invites/records',
  {
    method: 'POST',
    body: JSON.stringify({
      code: docCode, trainer: DCOACH.id, status: 'PENDING', expires: Date.now() + 86400_000,
    }),
  },
  DCOACH.token,
)

let peeked = null
try {
  peeked = await req(
    '/api/redeem',
    { method: 'POST', body: JSON.stringify({ code: docCode, peek: true }) },
    DFUT.token,
  )
} catch (e) {
  peeked = { error: `${e.status} ${e.message}` }
}
const peekedDocs = peeked?.documents ?? []
attachCheck(
  'документы приезжают в ответе на код',
  peekedDocs.length === 1 && peekedDocs[0].id === docFile.rec.id,
  peeked?.error ?? `получено ${peekedDocs.length}`,
)
attachCheck(
  'у документа приехал вид, по которому его называют',
  peekedDocs[0]?.kind === 'personal_data',
  `kind ${peekedDocs[0]?.kind ?? 'нет'}`,
)

const docRead = await req(
  `/api/collections/attachments/records/${docFile.rec.id}`,
  {},
  DFUT.token,
).then(() => 200).catch((e) => e.status)
attachCheck('будущий клиент читает запись документа', docRead === 200, `ответ ${docRead}`)

const docDownload = await getFile(DFUT, docFile.rec)
attachCheck(
  'будущий клиент открывает сам документ',
  docDownload.status === 200 && docDownload.body.includes(DOCTEXT),
  `ответ ${docDownload.status}`,
)

const photoRead = await req(
  `/api/collections/attachments/records/${coachPhoto.rec.id}`,
  {},
  DFUT.token,
).then(() => 200).catch((e) => e.status)
attachCheck('прочие вложения тренера закрыты', photoRead !== 200, `ответ ${photoRead}`)
const photoDownload = await getFile(DFUT, coachPhoto.rec)
attachCheck('файл не-документа не отдаётся', photoDownload.status !== 200, `ответ ${photoDownload.status}`)

// Перебрать документы всё так же нельзя: изъятие сделано в viewRule, а список
// закрыт. Идентификатор приходит только из ответа на действующий код.
const docList = await req('/api/collections/attachments/records?perPage=200', {}, DFUT.token)
  .catch(() => ({ items: [] }))
attachCheck(
  'списком документы не перечисляются',
  !(docList.items ?? []).some((i) => i.id === docFile.rec.id),
  `в списке ${docList.items?.length ?? 0}`,
)

// Без входа не открывается и документ: изъятие начинается с проверки входа.
const docAnon = await getFile(null, docFile.rec)
attachCheck('без входа документ не отдаётся', docAnon.status !== 200, `ответ ${docAnon.status}`)

/*
 * Заметки тренера о клиенте: читает их только тот, кто их написал.
 *
 * Заметка принадлежит клиенту (иначе тренер не нашёл бы её среди чужих
 * записей), а читать её клиент не должен — это то, что тренер пишет о нём для
 * себя. Правило доступа изымало заметки только из ветки «свои записи», а
 * вторая ветка — «все записи моих клиентов» — пропускала их кому угодно, кто
 * на этот момент числится тренером клиента. Кто именно заметку писал, правило
 * не смотрело вовсе, и отсюда два прохода:
 *
 * 1. Клиент читает заметку о себе чужими правами. Он заводит второй аккаунт,
 *    выписывает с него код приглашения (это может любой вошедший), сам
 *    отвязывается и сам же код гасит — и второй аккаунт становится его
 *    «тренером» со всеми правами на его записи. Дальше обычный список отдаёт
 *    ему то, что о нём думает настоящий тренер. Ни одного чужого пароля и ни
 *    одного подобранного идентификатора для этого не нужно.
 * 2. Следующий тренер читает заметки предыдущего. Клиент ушёл к другому —
 *    заметки остались лежать у него, и новый тренер получает их вместе со всей
 *    историей, хотя писались они не ему и не о работе с ним.
 *
 * Автор записан только в самой строке (payload.trainer_id) — другого следа у
 * записи нет, поэтому по нему правило и сверяет. Значение подставляет тот, кто
 * заметку создаёт: чужую заметку это прочитать не даёт (её payload не тронуть,
 * не увидев её), но подложить свою «от имени тренера» клиент может — это
 * сверка содержимого, и её место в records.pb.js.
 */
console.log('\nЗаметки тренера о клиенте:')

const noteCheck = (label, good, note = '') => {
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}${note ? `: ${note}` : ''}`)
}

const NT1 = await makeUser(`note-coach${stamp}@local.test`, 'trainer')
const NT2 = await makeUser(`note-coach2${stamp}@local.test`, 'trainer')
const NC = await makeUser(`note-client${stamp}@local.test`, 'client')
// Роль второго аккаунта не важна: «тренером» делает поле trainer у клиента,
// а не собственная роль — потому подставным и годится обычный клиент.
const NPUP = await makeUser(`note-puppet${stamp}@local.test`, 'client')
await req(
  `/api/collections/users/records/${NC.id}`,
  { method: 'PATCH', body: JSON.stringify({ trainer: NT1.id }) },
  su.token,
)

const SECRET = 'НЕ ПОКАЗЫВАТЬ КЛИЕНТУ'
let noteId = ''
try {
  const rec = await req(
    '/api/collections/records/records',
    {
      method: 'POST',
      body: JSON.stringify({
        owner: NC.id, tbl: 'trainerNotes', rid: `tn-${stamp}`, updated: ts,
        payload: { id: `tn-${stamp}`, client_id: NC.id, trainer_id: NT1.id, text: SECRET },
      }),
    },
    NT1.token,
  )
  noteId = rec.id
  console.log('  ✓ тренер заводит заметку о своём клиенте: ok')
} catch (e) {
  failures++
  console.log(`  ✗ тренер заводит заметку о своём клиенте: отказ — ${e.status} ${e.message}`)
}

/** Всё, что видно этому человеку в records, — одной строкой. Ищем в ней текст. */
const notesSeenBy = async (who) => {
  const seen = []
  const page = await req('/api/collections/records/records?perPage=500', {}, who.token)
    .catch(() => ({ items: [] }))
  seen.push(JSON.stringify(page.items ?? []))
  const filtered = await req(
    `/api/collections/records/records?perPage=500&filter=${encodeURIComponent('tbl="trainerNotes"')}`,
    {},
    who.token,
  ).catch(() => ({ items: [] }))
  seen.push(JSON.stringify(filtered.items ?? []))
  if (noteId) {
    const one = await req(`/api/collections/records/records/${noteId}`, {}, who.token).catch(() => null)
    seen.push(JSON.stringify(one ?? ''))
  }
  // Курсор обмена: приложение просит всё разом, отсев делает правило.
  const cursor = await req(
    `/api/collections/records/records?perPage=500&sort=seq,id&filter=${encodeURIComponent('seq > 0')}`,
    {},
    who.token,
  ).catch(() => ({ items: [] }))
  seen.push(JSON.stringify(cursor.items ?? []))
  return seen.join(' ')
}

noteCheck('автор читает свою заметку', (await notesSeenBy(NT1)).includes(SECRET))
noteCheck('клиент не читает заметку о себе', !(await notesSeenBy(NC)).includes(SECRET))

/*
 * Автор правит и стирает написанное — на отдельной заметке и пока связь цела.
 *
 * Автор записан в содержимом строки, и запрет, поставленный неаккуратно,
 * обернётся не «клиент не прочтёт», а «тренер не сотрёт то, что сам написал»,
 * — и заметит это только он, задним числом. Поэтому удаление заметки несёт
 * подпись автора и ничего больше (см. drainDeletes в src/db/sync.ts): пустой
 * тумбстоун правило больше не пропускает, и это проверяется ниже отдельно.
 */
let sparId = ''
try {
  const rec = await req(
    '/api/collections/records/records',
    {
      method: 'POST',
      body: JSON.stringify({
        owner: NC.id, tbl: 'trainerNotes', rid: `tn-spar-${stamp}`, updated: ts,
        payload: { id: `tn-spar-${stamp}`, client_id: NC.id, trainer_id: NT1.id, text: 'черновик' },
      }),
    },
    NT1.token,
  )
  sparId = rec.id
} catch (e) {
  failures++
  console.log(`  ✗ вторая заметка не завелась: ${e.status} ${e.message}`)
}
if (sparId) {
  const edited = await req(
    `/api/collections/records/records/${sparId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        updated: ts + 5000,
        payload: { id: `tn-spar-${stamp}`, client_id: NC.id, trainer_id: NT1.id, text: 'поправил' },
      }),
    },
    NT1.token,
  ).then(() => 200).catch((e) => e.status)
  noteCheck('автор правит свою заметку', edited === 200, `ответ ${edited}`)

  const tombed = await req(
    `/api/collections/records/records/${sparId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        updated: ts + 6000,
        deleted: true,
        payload: { trainer_id: NT1.id },
      }),
    },
    NT1.token,
  ).then(() => 200).catch((e) => e.status)
  noteCheck('автор удаляет свою заметку (тумбстоун)', tombed === 200, `ответ ${tombed}`)
  // Ради этого всё и затевалось: удаление должно доехать до второго телефона
  // того же тренера, а доедет оно, только если он его увидит.
  noteCheck(
    'автор видит своё удаление (оно доедет до второго телефона)',
    (await notesSeenBy(NT1)).includes(`tn-spar-${stamp}`),
  )
}

/*
 * Пустое удаление, каким его слала прежняя сборка, — и почему подпись в нём
 * теперь обязательна.
 *
 * Отдельной заметкой, потому что исход тут разный у двух путей. Заведение
 * тумбстоуна с нуля (так уезжает удаление заметки, которую сервер ещё не
 * видел) без подписи не проходит вовсе: правило смотрит на присланное, а
 * автора в нём нет. Правка уже лежащей строки, наоборот, проходит — правило
 * судит по состоянию ДО изменения, и подпись там ещё на месте, — но
 * получившееся не видит уже никто, включая автора: строка превращается в
 * чёрную дыру, которую не прочитать и не переписать (POST упрётся в
 * уникальный индекс, PATCH — в 404). Поэтому подпись шлёт сам клиент.
 */
const blindRid = `tn-blind-${stamp}`
const blindCreate = await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: NC.id, tbl: 'trainerNotes', rid: blindRid, updated: ts, deleted: true, payload: null,
    }),
  },
  NT1.token,
).then(() => 200).catch((e) => e.status)
noteCheck('удаление без подписи автора не заводится', blindCreate !== 200, `ответ ${blindCreate}`)

const signedCreate = await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: NC.id, tbl: 'trainerNotes', rid: blindRid, updated: ts, deleted: true,
      payload: { trainer_id: NT1.id },
    }),
  },
  NT1.token,
).then(() => 200).catch((e) => e.status)
noteCheck('то же удаление с подписью заводится', signedCreate === 200, `ответ ${signedCreate}`)

// Подставной «тренер»: код выписывает сам аккаунт, гасит его клиент.
const pupCode = code6(stamp + 11)
await req(
  '/api/collections/invites/records',
  {
    method: 'POST',
    body: JSON.stringify({
      code: pupCode, trainer: NPUP.id, status: 'PENDING', expires: Date.now() + 86400_000,
    }),
  },
  NPUP.token,
)
await req('/api/unlink', { method: 'POST', body: JSON.stringify({ client: '' }) }, NC.token)
const pupRedeem = await req(
  '/api/redeem',
  { method: 'POST', body: JSON.stringify({ code: pupCode }) },
  NC.token,
).then(() => 200).catch((e) => e.status)
noteCheck(
  'подставной «тренер» клиента не читает заметку о нём',
  !(await notesSeenBy(NPUP)).includes(SECRET),
  `привязка ${pupRedeem}`,
)

// Следующий тренер: связь настоящая, заметка — чужая.
const nextCode = code6(stamp + 12)
await req(
  '/api/collections/invites/records',
  {
    method: 'POST',
    body: JSON.stringify({
      code: nextCode, trainer: NT2.id, status: 'PENDING', expires: Date.now() + 86400_000,
    }),
  },
  NT2.token,
)
await req('/api/unlink', { method: 'POST', body: JSON.stringify({ client: '' }) }, NC.token)
const nextRedeem = await req(
  '/api/redeem',
  { method: 'POST', body: JSON.stringify({ code: nextCode }) },
  NC.token,
).then(() => 200).catch((e) => e.status)
noteCheck(
  'следующий тренер не читает заметки предыдущего',
  !(await notesSeenBy(NT2)).includes(SECRET),
  `привязка ${nextRedeem}`,
)

// Ломать при этом нечего: обычные записи клиента новому тренеру видны, иначе
// «заметки только автору» тихо превратится в «клиент не доехал».
await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: NC.id, tbl: 'sessions', rid: `se-note-${stamp}`, updated: ts,
      payload: { id: `se-note-${stamp}`, user_id: NC.id, title: 'обычная тренировка' },
    }),
  },
  NC.token,
).catch(() => null)
const nt2Sees = await req('/api/collections/records/records?perPage=500', {}, NT2.token)
  .catch(() => ({ items: [] }))
noteCheck(
  'обычные записи клиента новому тренеру видны',
  (nt2Sees.items ?? []).some((r) => r.rid === `se-note-${stamp}`),
)

// Свою заметку новый тренер, разумеется, заводит и читает — запрет касается
// чужого авторства, а не таблицы целиком.
let ownNote = 0
try {
  await req(
    '/api/collections/records/records',
    {
      method: 'POST',
      body: JSON.stringify({
        owner: NC.id, tbl: 'trainerNotes', rid: `tn-next-${stamp}`, updated: ts,
        payload: { id: `tn-next-${stamp}`, client_id: NC.id, trainer_id: NT2.id, text: 'моя заметка' },
      }),
    },
    NT2.token,
  )
  ownNote = 200
} catch (e) {
  ownNote = e.status
}
noteCheck('новый тренер заводит свою заметку', ownNote === 200, `ответ ${ownNote}`)
noteCheck('новый тренер читает свою заметку', (await notesSeenBy(NT2)).includes('моя заметка'))

/*
 * Подложенная заметка: своя рука, чужая подпись.
 *
 * Правило доступа решает по payload.trainer_id, кто заметку прочитает, — то
 * есть подпись здесь работает как адрес доставки. Значит тренер, у которого
 * права на этого клиента есть, вправе написать заметку и подписать её кем-то
 * другим. Прочитает её тот, чьё имя стоит в подписи: следующий тренер этого же
 * клиента откроет карточку и увидит про человека слова, которых не писал.
 * Отсюда сверка в records.pb.js — и эти две проверки.
 */
const forgedNote = await req(
  '/api/collections/records/records',
  {
    method: 'POST',
    body: JSON.stringify({
      owner: NC.id, tbl: 'trainerNotes', rid: `tn-forged-${stamp}`, updated: ts,
      payload: {
        id: `tn-forged-${stamp}`, client_id: NC.id, trainer_id: NT1.id, text: 'я такого не писал',
      },
    }),
  },
  NT2.token,
).then(() => 200).catch((e) => e.status)
noteCheck('заметку с чужой подписью не завести', forgedNote !== 200, `ответ ${forgedNote}`)

// И подпись у уже лежащей заметки не переставляется: иначе запрет обходится
// в два запроса — завести своей рукой, потом переписать автора.
let ownNoteId = ''
try {
  const found = await req(
    `/api/collections/records/records?perPage=1&filter=${encodeURIComponent(`rid="tn-next-${stamp}"`)}`,
    {},
    NT2.token,
  )
  ownNoteId = found.items?.[0]?.id ?? ''
} catch {
  /* не нашли — проверку ниже пропустим осознанно */
}
if (ownNoteId) {
  const repointedNote = await req(
    `/api/collections/records/records/${ownNoteId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        updated: ts + 7000,
        payload: {
          id: `tn-next-${stamp}`, client_id: NC.id, trainer_id: NT1.id, text: 'моя заметка',
        },
      }),
    },
    NT2.token,
  ).then(() => 200).catch((e) => e.status)
  noteCheck('автор у лежащей заметки не переставляется', repointedNote !== 200, `ответ ${repointedNote}`)
} else {
  failures++
  console.log('  ✗ своя заметка нового тренера не нашлась — проверку подписи не прогнали')
}

/*
 * Перебор пароля по одному адресу почты.
 *
 * Проверяем главное: после пяти неудач подряд вход закрывается даже с верным
 * паролем, соседний адрес при этом свободен, а удачный вход счётчик обнуляет.
 */
console.log('\nПеребор пароля по адресу почты:')

const V = await makeUser(`victim${stamp}@local.test`, 'client')
const N = await makeUser(`bystander${stamp}@local.test`, 'client')

/** Пробует войти и возвращает код ответа. */
const tryLogin = async (email, password) => {
  try {
    await req('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: email, password }),
    })
    return 200
  } catch (e) {
    return e.status
  }
}

const victim = `victim${stamp}@local.test`
const bystander = `bystander${stamp}@local.test`
const expect = (label, got, want) => {
  const good = got === want
  if (!good) failures++
  console.log(`  ${good ? '✓' : '✗'} ${label}: ${got} (ждали ${want})`)
}

// Четыре неудачи — обычный отказ, вход ещё открыт.
for (let i = 1; i <= 4; i++) await tryLogin(victim, 'wrong-password')
expect('верный пароль после 4 неудач', await tryLogin(victim, PASS), 200)

// Удачный вход обнуляет счётчик: следующие четыре снова не запирают.
for (let i = 1; i <= 4; i++) await tryLogin(victim, 'wrong-password')
expect('счётчик сброшен удачным входом', await tryLogin(victim, PASS), 200)

// Пятая неудача подряд закрывает вход — даже с верным паролем.
for (let i = 1; i <= 5; i++) await tryLogin(victim, 'wrong-password')
expect('шестая попытка', await tryLogin(victim, 'wrong-password'), 429)
expect('верный пароль во время блокировки', await tryLogin(victim, PASS), 429)

// Соседний ящик к этому отношения не имеет.
expect('чужой адрес свободен', await tryLogin(bystander, PASS), 200)

// Регистр и пробелы не должны давать обход: ящик тот же.
expect('тот же адрес в другом регистре', await tryLogin(victim.toUpperCase(), PASS), 429)

void V, void N

/*
 * Тот же перебор, но по учётной записи администратора.
 *
 * Ящик администратора — самая дорогая мишень: его пароль открывает не один
 * профиль, а базу целиком, включая чужую переписку и медицинские сведения.
 * При этом счётчик неудач висел только на коллекции users, а администратор
 * входит по своему адресу — /api/collections/_superusers/auth-with-password,
 * — и перебирался вообще без ограничений. Встроенный лимитер тут не помощник:
 * он считает по адресу клиента, и перебор с десятка машин каждым из них
 * укладывается в порог (ровно та дыра, ради которой писан login-throttle).
 *
 * Проверяем на отдельно заведённом администраторе: запирать того, под кем
 * ходит деплой, посреди прогона нельзя.
 */
console.log('\nПеребор пароля администратора:')

const SU_PASS = 'stand-only-local-admin'

/** Заводит временного администратора стенда. */
const makeSu = async (email) => {
  const rec = await req(
    '/api/collections/_superusers/records',
    { method: 'POST', body: JSON.stringify({ email, password: SU_PASS, passwordConfirm: SU_PASS }) },
    su.token,
  )
  return { id: rec.id, email }
}

/** Пробует войти администратором и возвращает код ответа. */
const trySuLogin = async (email, password) => {
  try {
    await req('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: email, password }),
    })
    return 200
  } catch (e) {
    return e.status
  }
}

const SU1 = await makeSu(`admin-brute${stamp}@local.test`)
for (let i = 1; i <= 5; i++) await trySuLogin(SU1.email, 'wrong-password')
expect('верный пароль администратора после 5 неудач', await trySuLogin(SU1.email, SU_PASS), 429)

// Счётчики разных коллекций не смешиваются. Иначе человек, забывший пароль в
// приложении, запирал бы одноимённый вход в админку — и наоборот: постучав в
// открытую всем дверь users, посторонний закрывал бы админке вход, даже не
// зная, есть ли там такой адрес.
const SU2 = await makeSu(`admin-apart${stamp}@local.test`)
for (let i = 1; i <= 6; i++) await tryLogin(SU2.email, 'wrong-password')
expect('перебор через users не запирает администратора', await trySuLogin(SU2.email, SU_PASS), 200)

// Тот, под кем ходит деплой, остаётся при своём: запираются попытки по
// конкретному адресу, а не вход в админку вообще.
expect('вход основного администратора свободен', await trySuLogin(EMAIL, PASSWORD), 200)

for (const tmp of [SU1, SU2]) {
  await req(`/api/collections/_superusers/records/${tmp.id}`, { method: 'DELETE' }, su.token)
}

/*
 * Неиспользуемые способы входа выключены.
 *
 * Приложение входит только паролем. OTP, MFA и OAuth2 в PocketBase выключены
 * по умолчанию — но «по умолчанию» держится ровно до первого клика в админке,
 * а деплой чужую правку не заметит, пока настройка не выставлена в schema.mjs
 * явно. Цена клика высокая: каждый включённый способ — это ещё одна дверь
 * входа мимо login-throttle, который висит на входе по паролю.
 */
console.log('\nСпособы входа:')

const usersCol = await req('/api/collections/users', {}, su.token)
for (const [label, on] of [
  ['OTP выключен', usersCol.otp?.enabled],
  ['MFA выключена', usersCol.mfa?.enabled],
  ['OAuth2 выключен', usersCol.oauth2?.enabled],
  ['вход по паролю включён', !usersCol.passwordAuth?.enabled],
]) {
  if (on) failures++
  console.log(`  ${on ? '✗' : '✓'} ${label}`)
}

/*
 * Пакетный эндпоинт /api/batch закрыт.
 *
 * Один такой запрос упаковывает до полусотни созданий, правок и удалений по
 * любым коллекциям и идентификаторам — то есть удваивает поверхность, на
 * которой ищут подмену чужого идентификатора. Приложение им не пользуется
 * вовсе (в backend.ts его нет), так что закрытая дверь ничего не ломает.
 *
 * Проверка нужна не потому, что за дверью нашлась дыра: правила доступа и
 * наши обработчики внутри пакета отрабатывают так же, как на одиночном
 * запросе. Нужна она потому, что дверь открывается одним кликом в админке и
 * обратно её никто не закроет — деплой такую правку не заметит, пока
 * настройка не выставлена в schema.mjs явно. Держим её выключенной и
 * сторожим проверкой.
 */
console.log('\nПакетные запросы:')

const batchTry = async (who, requests) => {
  try {
    await req('/api/batch', { method: 'POST', body: JSON.stringify({ requests }) }, who?.token)
    return 200
  } catch (e) {
    return e.status
  }
}

const batchClosed = await batchTry(C, [
  {
    method: 'POST',
    url: '/api/collections/records/records',
    body: {
      owner: T.id,
      tbl: 'sessions',
      rid: `se-batch-${stamp}`,
      updated: ts + 9000,
      payload: { id: `se-batch-${stamp}`, user_id: T.id, title: 'пакетом' },
    },
  },
])
if (batchClosed !== 403) failures++
console.log(
  `  ${batchClosed === 403 ? '✓' : '✗'} /api/batch закрыт: ответ ${batchClosed} (ждали 403)`,
)

// Даже если дверь однажды приоткроют, чужая запись пакетом лечь не должна.
const batchLanded = await req(
  `/api/collections/records/records?filter=${encodeURIComponent(`rid="se-batch-${stamp}"`)}`,
  {},
  su.token,
)
if (batchLanded.totalItems) failures++
console.log(
  `  ${batchLanded.totalItems ? '✗' : '✓'} чужая запись пакетом не легла: ${batchLanded.totalItems} шт.`,
)

/*
 * Письма «забыли пароль» — потолок частоты.
 *
 * `POST /api/collections/{коллекция}/request-password-reset` открыт всему
 * интернету без входа и по замыслу PocketBase отвечает 204 всегда — иначе по
 * разнице ответов перечислялись бы наши люди. Обратная сторона: отправитель
 * писем доступен постороннему, а сам он не узнает, попал ли.
 *
 * Метка `*:auth` эту дверь НЕ закрывает — она про сам вход. Проверено
 * замером: со включённым лимитером 20 подряд входов дают 5×400 и 15×429, а
 * 20 подряд запросов сброса пароля — 20×204. То есть до появления отдельного
 * правила действовал только общий потолок `/api/` (300 за 10 секунд): около
 * тридцати писем в секунду на любой указанный ящик.
 *
 * Двери две, и обе плохи. На `users` — это забрасывание письмами клиента
 * нашим же сервером, с нашего домена. На `_superusers` — то же самое в адрес
 * учётной записи, которая открывает базу целиком, вместе с резервными
 * копиями; заодно это сжигает репутацию и квоту отправителя, и в потоке
 * настоящее письмо о смене пароля теряется.
 *
 * Правило заведено в applyLimits (schema.mjs). Метку берём точную: с опечаткой
 * в ней PocketBase молча ничего не ограничит, поэтому проверяем поведением, а
 * не наличием строки в настройках. Лимитер на стенде обычно выключен (его
 * включает PB_RATE_LIMITS=on только на деплое), поэтому включаем на время
 * замера и возвращаем как было.
 */
console.log('\nПисьма «забыли пароль»:')

const before = await req('/api/settings', {}, su.token)
await req(
  '/api/settings',
  {
    method: 'PATCH',
    body: JSON.stringify({ rateLimits: { ...before.rateLimits, enabled: true } }),
  },
  su.token,
)

/** Шлёт n запросов сброса пароля подряд и возвращает раскладку по кодам. */
const floodReset = async (collection, email, n = 12) => {
  const codes = {}
  for (let i = 0; i < n; i++) {
    let code = 204
    try {
      await req(`/api/collections/${collection}/request-password-reset`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    } catch (e) {
      code = e.status
    }
    codes[code] = (codes[code] ?? 0) + 1
  }
  return codes
}

for (const [collection, email] of [
  ['_superusers', EMAIL],
  ['users', `client${stamp}@local.test`],
]) {
  const codes = await floodReset(collection, email)
  const stopped = (codes[429] ?? 0) > 0
  if (!stopped) failures++
  console.log(
    `  ${stopped ? '✓' : '✗'} поток писем по ${collection} упирается в потолок: ` +
      Object.entries(codes)
        .map(([c, n]) => `${n}×${c}`)
        .join(', '),
  )
}

// Возвращаем выключатель как был: стенд не должен остаться с лимитером,
// включённым посреди прогона, — следующие проверки ловили бы 429 на ровном
// месте, и разбираться пришлось бы долго.
await req(
  '/api/settings',
  {
    method: 'PATCH',
    body: JSON.stringify({ rateLimits: { ...before.rateLimits, enabled: false } }),
  },
  su.token,
)

// Метка очереди: без неё запись не доедет ни до кого, и молча.
const all = await req('/api/collections/records/records?perPage=500&fields=tbl,rid,seq', {}, su.token)
const noSeq = all.items.filter((r) => !r.seq)
console.log(`\nЗаписей: ${all.items.length}, без seq: ${noSeq.length}`)
if (noSeq.length) {
  failures++
  console.log('  ', noSeq.map((r) => `${r.tbl}/${r.rid}`).join(', '))
}

console.log(failures ? `\nНе сошлось: ${failures}` : '\nВсё сошлось')
process.exit(failures ? 1 : 0)
