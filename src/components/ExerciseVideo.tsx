import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Attachment } from '../db/db'
import { addAttachment, deleteAttachment } from '../db/coach'
import { IconTrash, IconVideo } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/** Blob из IndexedDB → временный URL, который освобождаем при размонтировании. */
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

export function AttachmentPlayer({
  attachment,
  onDelete,
}: {
  attachment: Attachment
  onDelete?: () => void
}) {
  const url = useBlobUrl(attachment.blob)
  if (!url) return null

  return (
    <div style={{ marginTop: 8 }}>
      {attachment.kind === 'video' ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block' }}
        />
      ) : (
        <img src={url} alt="Техника выполнения" style={{ width: '100%', borderRadius: 12 }} />
      )}
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="mute-sm">
          {attachment.kind === 'video' ? 'Видео' : 'Фото'} ·{' '}
          {(attachment.size / 1024 / 1024).toFixed(1)} МБ
        </span>
        {onDelete && (
          <button className="icon-btn" onClick={onDelete} aria-label="Удалить">
            <IconTrash size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Кнопка «снять технику» для клиента: на телефоне открывает камеру,
 * на десктопе — выбор файла. Ролик остаётся на устройстве и виден тренеру.
 */
export function VideoUploader({
  sessionId,
  exerciseId,
  compact,
}: {
  sessionId: string
  exerciseId: string
  compact?: boolean
}) {
  const { toast, userId } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const items = useLiveQuery(
    () =>
      db.attachments
        .where('[session_id+exercise_id]')
        .equals([sessionId, exerciseId])
        .toArray(),
    [sessionId, exerciseId],
    [] as Attachment[],
  )

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      await addAttachment({ sessionId, exerciseId, file, userId })
      haptics.success()
      toast('Видео прикреплено')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось прикрепить файл')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={compact ? undefined : { padding: '0 12px 12px' }}>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {(items ?? []).map((a) => (
        <AttachmentPlayer
          key={a.id}
          attachment={a}
          onDelete={async () => {
            await deleteAttachment(a.id)
            toast('Видео удалено')
          }}
        />
      ))}

      <button
        className="btn sm block"
        style={{ marginTop: (items ?? []).length ? 8 : 0 }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <IconVideo size={15} />
        {busy ? 'Сохраняю…' : (items ?? []).length ? 'Добавить ещё видео' : 'Снять технику'}
      </button>
    </div>
  )
}
