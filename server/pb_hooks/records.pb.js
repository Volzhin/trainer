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
 * ВАЖНО, ПРЕЖДЕ ЧЕМ ПРАВИТЬ. Обработчик исполняется в отдельной машине: на
 * сервер уезжает исходник самой функции, а окружающий файл ей недоступен.
 * Вынесенный наружу помощник превращается в `ReferenceError` — не при
 * загрузке, а на каждом запросе, — и сервер начинает отвечать отказом на
 * любую запись, от кого угодно. Так однажды и вышло: обмен встал у всех сразу
 * и в обе стороны, а внешне выглядело как «данные не доходят». Поэтому всё,
 * чем пользуется проверка, объявлено внутри неё, и любую правку здесь надо
 * гонять на местном стенде — см. «Проверка обработчиков» в DEPLOY.md.
 *
 * Проверки намеренно пропускают всё, чего не смогли разобрать: обмен важнее
 * строгости. Настоящая защита от подмены стоит и на устройстве (см. apply в
 * src/db/sync.ts) — здесь она вторым рубежом.
 */

function check(e) {
  const record = e.record

  /** Содержимое записи. Не разобралось — значит судить не о чем. */
  const payloadOf = (rec) => {
    try {
      const raw = rec.getString('payload')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch (err) {
      return null
    }
  }

  /*
   * Где внутри строки записан её владелец.
   *
   * Таблицы, у которых владелец выводится из родителя (подходы — из
   * тренировки, дни программы — из программы), сюда не входят: родителя
   * пришлось бы искать запросом на каждую запись. Их сверяет устройство.
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

  const tbl = record.getString('tbl')
  const rid = record.getString('rid')
  const owner = record.getString('owner')
  const payload = payloadOf(record)

  /** Каким адрес записи был до правки. У создания предыдущего состояния нет. */
  let before = null
  if (record.id) {
    try {
      before = e.app.findRecordById('records', record.id)
    } catch (err) {
      before = null
    }
  }

  /*
   * Тройка «владелец, таблица, ключ» — это адрес, по которому строка ляжет в
   * чужую базу, и после создания записи он не меняется.
   *
   * Правило доступа на правку проверяет запись ДО изменения: свою она находит
   * и пропускает, а что PATCH переписывает владельца на тренера, правило уже
   * не смотрит. Клиент заводил свою запись и одним запросом переносил её на
   * любой адрес вместе с любым содержимым — обе проверки ниже при этом
   * сходились, потому что владельца он подставлял сам. Так подменялся профиль
   * тренера у него же на устройстве.
   *
   * Обмену это ничего не ломает: upsertRecord ищет запись как раз по этой
   * тройке и дописывает только updated, deleted и payload.
   */
  if (
    before &&
    (before.getString('owner') !== owner ||
      before.getString('tbl') !== tbl ||
      before.getString('rid') !== rid)
  ) {
    throw new BadRequestError('Владелец, таблица и ключ записи не меняются')
  }

  /*
   * Ключ, в котором записан его владелец.
   *
   * У части таблиц первичный ключ выводится из человека: профиль лежит под его
   * идентификатором, день питания и дневная активность — под «человек:дата»,
   * связь — под «link-тренер-клиент». По такому ключу получатель их и читает,
   * поэтому чужой ключ означает не лишнюю строку, а подменённую.
   *
   * Проверка стоит до разбора payload намеренно: у тумбстоуна содержимого нет
   * вовсе, сверять его не с чем, а удаление по чужому ключу стирает у тренера
   * его собственный профиль. Ключи, не похожие на выводимые (случайный uid,
   * старые связи без префикса), не трогаем: их судит устройство.
   */
  if (owner && rid) {
    const colon = rid.indexOf(':')
    const badKey =
      ((tbl === 'profile' || tbl === 'nutritionProfile') && rid !== owner) ||
      ((tbl === 'nutritionDays' || tbl === 'dailyActivity') &&
        colon > 0 &&
        rid.substring(0, colon) !== owner) ||
      (tbl === 'links' &&
        rid.indexOf('link-') === 0 &&
        rid.substring(rid.length - owner.length - 1) !== '-' + owner)
    if (badKey) throw new BadRequestError('Ключ записи принадлежит другому человеку')
  }

  // Тумбстоун приезжает без содержимого — дальше проверять нечего.
  if (!payload || !tbl || !rid) return e.next()

  // Ключ строки. У приглашений это сам код.
  const key = tbl === 'invites' ? payload.code : payload.id
  if (typeof key === 'string' && key && key !== rid) {
    throw new BadRequestError('Ключ записи не совпадает с её содержимым')
  }

  const field = OWNER_FIELD[tbl] || 'user_id'
  const value = payload[field]
  // Пустое поле не судим: у общего каталога владельца нет вовсе.
  if (typeof value === 'string' && value !== '' && value !== owner) {
    throw new BadRequestError('Владелец записи не совпадает с её содержимым')
  }

  /*
   * Сообщение подписано автором, и подпись эта — единственное, чем одна
   * сторона переписки отличается от другой. Без сверки клиент заводит
   * сообщение с author_id тренера, и в ветке появляются слова, которых тот
   * не говорил, — у обоих сразу.
   *
   * Правка существующего — это отметка «прочитано», и делает её как раз
   * не автор. Поэтому у правки сверяется не подпись с тем, кто пришёл, а
   * подпись и текст с тем, что уже лежит: переписать чужое нельзя, отметить
   * прочитанным можно.
   */
  if (tbl === 'chat' && e.auth) {
    const was = before ? payloadOf(before) : null

    if (was) {
      if (
        (payload.author_id && was.author_id && payload.author_id !== was.author_id) ||
        (payload.text !== undefined && was.text !== undefined && payload.text !== was.text)
      ) {
        throw new BadRequestError('Чужое сообщение не переписывается')
      }
    } else if (payload.author_id && payload.author_id !== e.auth.id) {
      throw new BadRequestError('Сообщение можно написать только от своего имени')
    }
  }

  return e.next()
}

onRecordCreateRequest(check, 'records')
onRecordUpdateRequest(check, 'records')
