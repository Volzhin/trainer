import { useEffect, useState, type ReactNode } from 'react'
import type { Attachment } from '../db/db'
import { attachmentUrl } from '../lib/backend'

/**
 * Превью прикреплённого скриншота.
 *
 * Ссылку на локальный файл создаём один раз и освобождаем при уходе.
 * Написанная прямо в разметке, createObjectURL выдаёт новый адрес на
 * каждую перерисовку и держит файл в памяти до перезагрузки вкладки —
 * с десятком скриншотов это заметно.
 *
 * Если оригинала на устройстве нет (запись приехала с сервера), берём
 * файл по сети: у тренера чужих Blob-ов не бывает.
 */
export function ShotThumb({
  attachment,
  children,
}: {
  attachment: Attachment
  /** Кнопки поверх превью — например, удаление. */
  children?: ReactNode
}) {
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    if (attachment.blob) {
      const url = URL.createObjectURL(attachment.blob)
      setSrc(url)
      return () => URL.revokeObjectURL(url)
    }
    setSrc(
      attachment.remote_id && attachment.remote_file
        ? attachmentUrl(attachment.remote_id, attachment.remote_file)
        : undefined,
    )
  }, [attachment.blob, attachment.remote_id, attachment.remote_file])

  return (
    <div className="shot">
      {src && <img src={src} alt="" loading="lazy" />}
      {children}
    </div>
  )
}
