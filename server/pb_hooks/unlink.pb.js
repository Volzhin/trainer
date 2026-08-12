/// <reference path="../pb_data/types.d.ts" />

/**
 * Разрыв связи тренера и клиента.
 *
 * Связь живёт полем trainer в записи клиента, а править свою запись вправе
 * только он сам — правило доступа у users так и звучит. Поэтому тренер,
 * убирая клиента у себя, рвал связь только на своём устройстве: на сервере
 * она оставалась, клиент продолжал числиться за ним, а подключить другого
 * тренера уже не мог.
 *
 * Отдельный обработчик решает это, не открывая чужие записи на запись
 * вообще: он проверяет, что зовущий — либо сам клиент, либо именно тот
 * тренер, за которым клиент числится сейчас. Чужого клиента отвязать
 * нельзя, даже зная его идентификатор.
 */
routerAdd('POST', '/api/unlink', (e) => {
  const auth = e.auth
  if (!auth) {
    return e.json(401, { message: 'Нужно войти' })
  }

  const body = new DynamicModel({ client: '' })
  e.bindBody(body)

  const clientId = String(body.client || '').trim() || auth.id

  let client
  try {
    client = e.app.findRecordById('users', clientId)
  } catch {
    return e.json(404, { message: 'Клиент не найден' })
  }

  const trainerId = client.getString('trainer')
  if (!trainerId) {
    // Связи и так нет. Отвечаем успехом: повторный вызов не должен падать,
    // а результат ровно тот, которого просили.
    return e.json(200, { ok: true })
  }

  const allowed = auth.id === clientId || auth.id === trainerId
  if (!allowed) {
    return e.json(403, { message: 'Это не ваш клиент' })
  }

  client.set('trainer', null)
  e.app.save(client)

  return e.json(200, { ok: true })
})
