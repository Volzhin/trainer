import { db, enqueue } from './db'
import { deleteRemoteAttachment, isAuthed } from '../lib/backend'

/**
 * Работа с вложениями, нужная обеим сторонам.
 *
 * Отдельным модулем не ради красоты: вложения удаляют и кабинет тренера
 * (`coach.ts`), и задания (`reports.ts`), а `coach.ts` уже импортирует
 * `reports.ts` ради обязательных заданий — обратная ссылка замкнула бы их
 * друг на друга. Общий помощник живёт ниже обоих и не знает про них ничего.
 */

/**
 * Удаляет вложение вместе с файлом на сервере.
 *
 * Файл сносится отдельным запросом: иначе видео, которое человек у себя
 * удалил, продолжает лежать в хранилище и показываться тренеру. Запись об
 * удалении ставится в очередь в любом случае — без сети файл снести не
 * выйдет, но и забывать об удалении нельзя.
 */
export async function deleteAttachment(id: string) {
  const row = await db.attachments.get(id)
  await db.attachments.delete(id)
  if (!row) return

  if (row.remote_id) {
    if (isAuthed()) await deleteRemoteAttachment(row.remote_id).catch(() => {})
    await enqueue('attachments', id, 'delete', row)
  }
}
