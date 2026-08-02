import {
  db,
  uid,
  now,
  currentUserId,
  threadId,
  type ChatKind,
  type ChatMessage,
  type Role,
} from './db'

/**
 * Переписка тренера и клиента. Диалог всегда один на пару участников,
 * поэтому ключом служит thread_id — не нужно искать сообщения перебором
 * по двум полям и держать индекс на каждое направление.
 */

/** Крупные вложения быстро выедают квоту IndexedDB, поэтому ограничиваем. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

type SendBase = { trainerId: string; clientId: string; authorRole: Role }

async function push(
  base: SendBase,
  kind: ChatKind,
  patch: Partial<ChatMessage>,
): Promise<string> {
  const id = uid()
  const ts = now()
  await db.chat.add({
    id,
    thread_id: threadId(base.trainerId, base.clientId),
    trainer_id: base.trainerId,
    client_id: base.clientId,
    author_id: currentUserId(),
    author_role: base.authorRole,
    kind,
    created_at: ts,
    is_read: 0,
    updated_at: ts,
    ...patch,
  })
  return id
}

export async function sendText(base: SendBase, text: string) {
  const value = text.trim()
  if (!value) return null
  return push(base, 'text', { text: value })
}

export async function sendMedia(
  base: SendBase,
  kind: Exclude<ChatKind, 'text'>,
  file: Blob,
  extra: { duration?: number; fileName?: string; waveform?: number[] } = {},
) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Файл больше 50 МБ — не поместится в локальное хранилище')
  }
  return push(base, kind, {
    blob: file,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    duration: extra.duration,
    file_name: extra.fileName,
    waveform: extra.waveform,
  })
}

export async function listThread(trainerId: string, clientId: string): Promise<ChatMessage[]> {
  return db.chat.where('thread_id').equals(threadId(trainerId, clientId)).sortBy('created_at')
}

/** Помечает прочитанными всё, что написал собеседник. */
export async function markThreadRead(trainerId: string, clientId: string) {
  const me = currentUserId()
  const rows = await db.chat
    .where('thread_id')
    .equals(threadId(trainerId, clientId))
    .and((m) => m.is_read === 0 && m.author_id !== me)
    .toArray()
  for (const m of rows) await db.chat.update(m.id, { is_read: 1, updated_at: now() })
  return rows.length
}

/** Непрочитанные в диалоге — для бейджа у входа в чат. */
export async function unreadCount(trainerId: string, clientId: string) {
  const me = currentUserId()
  return db.chat
    .where('thread_id')
    .equals(threadId(trainerId, clientId))
    .and((m) => m.is_read === 0 && m.author_id !== me)
    .count()
}

export async function lastMessage(trainerId: string, clientId: string) {
  const rows = await listThread(trainerId, clientId)
  return rows[rows.length - 1]
}

export async function deleteMessage(id: string) {
  await db.chat.delete(id)
}

/** Короткое описание сообщения для списка диалогов. */
export function previewOf(m?: ChatMessage): string {
  if (!m) return 'Сообщений пока нет'
  switch (m.kind) {
    case 'voice':
      return 'Голосовое сообщение'
    case 'circle':
      return 'Видеосообщение'
    case 'image':
      return 'Изображение'
    case 'file':
      return m.file_name ?? 'Файл'
    default:
      return m.text ?? ''
  }
}
