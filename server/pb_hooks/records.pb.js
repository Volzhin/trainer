/// <reference path="../pb_data/types.d.ts" />

/**
 * Проверка записей синхронизации.
 *
 * Правила доступа отвечают на вопрос «чья это строка», но не на вопрос «что
 * у неё внутри». Между тем в payload лежит готовая строка чужой базы: она
 * ложится на устройство получателя по первичному ключу из самого payload.
 * Значит владелец записи и ключ, по которому она приземлится, — разные вещи,
 * и без сверки любой может прислать запись со своим owner и чужим id внутри.
 *
 * Обе проверки ниже намеренно пропускают всё, чего не смогли разобрать:
 * обмен важнее строгости, и отказ по недоразумению остановил бы синхронизацию
 * у всех сразу. Настоящая защита от подмены стоит и на устройстве
 * (см. apply в src/db/sync.ts) — здесь она вторым рубежом.
 */

function payloadOf(record) {
  try {
    const raw = record.getString('payload')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Ключ строки в базе устройства. У приглашений это сам код. */
function primaryKey(tbl, payload) {
  return tbl === 'invites' ? payload.code : payload.id
}

/*
 * Где внутри строки записан её владелец.
 *
 * Правило доступа проверяет владельца записи, но не сверяет его с тем, кому
 * строка принадлежит по смыслу: клиент вправе прислать запись со своим owner
 * и строкой профиля тренера внутри, и она ляжет тренеру поверх собственной.
 *
 * Таблицы, у которых владелец выводится из родителя (подходы — из
 * тренировки, дни программы — из программы), сюда не входят: родителя здесь
 * пришлось бы искать запросом на каждую запись. Их сверяет устройство —
 * см. apply в src/db/sync.ts.
 */
const OWNER_FIELD = {
  profile: 'id',
  nutritionProfile: 'id',
  reviews: 'trainer_id',
  invites: 'trainer_id',
  links: 'client_id',
  assignments: 'client_id',
  trainerNotes: 'client_id',
  feedback: 'client_id',
  nutritionTargets: 'client_id',
  tasks: 'client_id',
  reportReplies: 'client_id',
  chat: 'client_id',
  programs: 'client_id',
}

function ownerMismatch(tbl, payload, owner) {
  const field = OWNER_FIELD[tbl] || 'user_id'
  const value = payload[field]
  // Пустое поле не судим: у общего каталога владельца нет вовсе.
  return typeof value === 'string' && value !== '' && value !== owner
}

function check(e) {
  const record = e.record
  const tbl = record.getString('tbl')
  const rid = record.getString('rid')
  const payload = payloadOf(record)

  // Тумбстоун приезжает без содержимого — проверять нечего.
  if (!payload || !tbl || !rid) return e.next()

  const key = primaryKey(tbl, payload)
  if (typeof key === 'string' && key && key !== rid) {
    throw new BadRequestError('Ключ записи не совпадает с её содержимым')
  }

  if (ownerMismatch(tbl, payload, record.getString('owner'))) {
    throw new BadRequestError('Владелец записи не совпадает с её содержимым')
  }

  // Сообщение подписано автором, и подпись эта — единственное, чем одна
  // сторона переписки отличается от другой. Без сверки клиент заводит
  // сообщение с author_id тренера, и в ветке появляются слова, которых тот
  // не говорил, — у обоих сразу.
  if (tbl === 'chat' && e.auth) {
    const before = existing(e, record.id)
    if (before) {
      // Правка существующего — это отметка «прочитано». Автор и текст в ней
      // меняться не должны, кем бы она ни делалась.
      if (
        (payload.author_id && before.author_id && payload.author_id !== before.author_id) ||
        (payload.text !== undefined &&
          before.text !== undefined &&
          payload.text !== before.text)
      ) {
        throw new BadRequestError('Чужое сообщение не переписывается')
      }
    } else if (payload.author_id && payload.author_id !== e.auth.id) {
      throw new BadRequestError('Сообщение можно написать только от своего имени')
    }
  }

  return e.next()
}

/** Что лежало в записи до правки. Нет записи — значит она создаётся. */
function existing(e, id) {
  if (!id) return null
  try {
    return payloadOf(e.app.findRecordById('records', id))
  } catch {
    return null
  }
}

onRecordCreateRequest(check, 'records')
onRecordUpdateRequest(check, 'records')
