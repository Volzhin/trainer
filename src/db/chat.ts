import { db, uid, now, threadId, type ChatMessage, type Role } from './db'

/**
 * Переписка тренера и клиента.
 *
 * Диалог один на пару, и ключ у него выводится из участников
 * (`threadId`), а не выдаётся случайно: обе стороны должны попадать в одну
 * и ту же ветку, не сговариваясь и не дожидаясь обмена с сервером.
 *
 * Сообщение принадлежит клиенту — как и остальное, что заведено про него.
 * Поэтому оно доезжает до обоих: сервер отдаёт человеку его записи и записи
 * его клиентов. Отдельной «копии для тренера» нет, и расходиться нечему.
 *
 * Пока переписка текстовая. Голосовые, кружки и файлы модель уже описывает
 * (`ChatKind`, `blob`), но своего пути выгрузки у них ещё нет — см. комментарий
 * к `chat` в `ownerOf` (`db/sync.ts`).
 */

/** Отправляет текстовое сообщение. Пустое не отправляется вовсе. */
export async function sendText(input: {
  trainerId: string
  clientId: string
  authorId: string
  authorRole: Role
  text: string
}): Promise<string | null> {
  const text = input.text.trim()
  if (!text) return null

  const id = uid()
  const ts = now()
  await db.chat.add({
    id,
    thread_id: threadId(input.trainerId, input.clientId),
    trainer_id: input.trainerId,
    client_id: input.clientId,
    author_id: input.authorId,
    author_role: input.authorRole,
    kind: 'text',
    text,
    created_at: ts,
    is_read: 0,
    updated_at: ts,
  })
  return id
}

/** Вся ветка по возрастанию времени — так её и читают. */
export async function threadMessages(
  trainerId: string,
  clientId: string,
): Promise<ChatMessage[]> {
  return db.chat.where('thread_id').equals(threadId(trainerId, clientId)).sortBy('created_at')
}

/**
 * Отмечает прочитанным то, что написал собеседник.
 *
 * Свои сообщения не трогаем: «прочитано» здесь означает «дошло до второго»,
 * и проставлять его себе значило бы врать отправителю.
 */
export async function markThreadRead(
  trainerId: string,
  clientId: string,
  readerId: string,
): Promise<number> {
  const tid = threadId(trainerId, clientId)
  const unread = await db.chat.where('[thread_id+is_read]').equals([tid, 0]).toArray()
  const theirs = unread.filter((m) => m.author_id !== readerId)
  if (!theirs.length) return 0

  const ts = now()
  await db.chat.bulkPut(theirs.map((m) => ({ ...m, is_read: 1, updated_at: ts })))
  return theirs.length
}

/** Сколько сообщений собеседника ещё не прочитано. */
export async function unreadCount(
  trainerId: string,
  clientId: string,
  readerId: string,
): Promise<number> {
  const tid = threadId(trainerId, clientId)
  const unread = await db.chat.where('[thread_id+is_read]').equals([tid, 0]).toArray()
  return unread.filter((m) => m.author_id !== readerId).length
}

/** Последнее сообщение ветки — строка предпросмотра в списке клиентов. */
export async function lastMessage(
  trainerId: string,
  clientId: string,
): Promise<ChatMessage | undefined> {
  const rows = await threadMessages(trainerId, clientId)
  return rows[rows.length - 1]
}
