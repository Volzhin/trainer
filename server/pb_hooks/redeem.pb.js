/// <reference path="../pb_data/types.d.ts" />

/**
 * Погашение кода приглашения.
 *
 * Раньше клиент искал код сам, а значит коллекция приглашений была открыта
 * на чтение всем вошедшим — и любой мог выгрузить чужие коды и привязаться
 * к незнакомому тренеру. Поиск по коду перенесён сюда: наружу отдаётся
 * только результат по конкретному коду, который человек и так знает.
 */
routerAdd('POST', '/api/redeem', (e) => {
  const auth = e.auth
  if (!auth) {
    return e.json(401, { message: 'Нужно войти' })
  }

  const body = new DynamicModel({ code: '' })
  e.bindBody(body)

  const code = String(body.code || '')
    .trim()
    .toUpperCase()
  if (!code) {
    return e.json(400, { message: 'Код не указан' })
  }

  let invite
  try {
    invite = e.app.findFirstRecordByFilter(
      'invites',
      'code = {:code} && status = "PENDING"',
      { code },
    )
  } catch {
    return e.json(404, { message: 'Код не найден или уже использован' })
  }

  const trainerId = invite.getString('trainer')
  if (trainerId === auth.id) {
    return e.json(400, { message: 'Нельзя пригласить самого себя' })
  }

  const expires = invite.getInt('expires')
  if (expires && expires < Date.now()) {
    return e.json(400, { message: 'Срок действия кода истёк' })
  }

  const trainer = e.app.findRecordById('users', trainerId)

  // Обе записи меняются вместе: код без привязки оставил бы клиента
  // с погашенным кодом и без тренера.
  e.app.runInTransaction((tx) => {
    invite.set('status', 'ACCEPTED')
    invite.set('client', auth.id)
    tx.save(invite)

    auth.set('trainer', trainerId)
    tx.save(auth)
  })

  return e.json(200, {
    trainer: {
      id: trainerId,
      name: trainer.getString('name'),
      contacts: trainer.get('contacts'),
      preferred_contact: trainer.getString('preferred_contact'),
    },
  })
})
