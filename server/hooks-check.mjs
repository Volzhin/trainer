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
