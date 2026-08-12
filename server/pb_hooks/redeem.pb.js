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

  /*
   * peek — только посмотреть, не гася код.
   *
   * Клиенту нужно прочитать документы тренера до того, как он согласится,
   * а прав на чужие записи у него до привязки нет. Поэтому проверку кода
   * и саму привязку пришлось развести: сначала он спрашивает, с кем и на
   * каких условиях, потом соглашается. Гасить код на первом шаге нельзя —
   * передумавший остался бы без кода и без тренера.
   */
  const body = new DynamicModel({ code: '', peek: false })
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

  /*
   * Тренер у клиента ровно один — поле trainer в его записи одно.
   *
   * Без этой проверки код второго тренера молча переписывал бы поле, и
   * прежний тренер терял доступ к клиенту, ничего об этом не узнав.
   * Проверка на клиенте есть, но она не защита: запрос уходит и в обход
   * приложения.
   */
  const current = auth.getString('trainer')
  if (current && current !== trainerId) {
    return e.json(400, {
      message: 'У вас уже есть тренер — отключитесь от него, прежде чем подключать другого',
    })
  }

  const trainer = e.app.findRecordById('users', trainerId)

  // Документы тренера — то, что клиент подписывает. Чего нет, того он не
  // увидит и подписывать не будет.
  let documents = []
  try {
    const rows = e.app.findRecordsByFilter(
      'attachments',
      'owner = {:owner} && kind = "document"',
      '-created',
      20,
      0,
      { owner: trainerId },
    )
    documents = rows.map((r) => ({
      kind: r.getString('note'),
      id: r.id,
      file: r.getString('file'),
    }))
  } catch {
    documents = []
  }

  const card = {
    trainer: {
      id: trainerId,
      name: trainer.getString('name'),
      contacts: trainer.get('contacts'),
      preferred_contact: trainer.getString('preferred_contact'),
    },
    documents,
  }

  if (body.peek) return e.json(200, card)

  // Обе записи меняются вместе: код без привязки оставил бы клиента
  // с погашенным кодом и без тренера.
  e.app.runInTransaction((tx) => {
    invite.set('status', 'ACCEPTED')
    invite.set('client', auth.id)
    tx.save(invite)

    auth.set('trainer', trainerId)
    tx.save(auth)
  })

  return e.json(200, card)
})
