import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Attachment } from '../db/db'
import { addAttachment, deleteAttachment } from '../db/coach'
import { onAttachmentUpload, retryAttachment, uploadingAttachment } from '../db/sync'
import { attachmentUrl } from '../lib/backend'
import { IconGallery, IconTrash, IconVideo } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

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

/**
 * Что сейчас с отправкой этого файла — словами, а не молчанием.
 *
 * Файл лежит в базе устройства с первой секунды, а до тренера едет отдельно и
 * иногда подолгу: ролик на сотню мегабайт уходит по мобильной сети минутами.
 * Пока об этом не говорили, «сохранено у меня» и «дошло до тренера»
 * выглядели одинаково — как обычное видео на экране.
 *
 * Чужой файл (приехал с сервера, своего Blob нет) состояния не имеет:
 * отправлять с этого устройства нечего.
 */
function uploadState(
  a: Attachment,
  uploading: string | null,
): 'none' | 'sent' | 'sending' | 'waiting' | 'refused' {
  if (!a.blob) return 'none'
  if (a.remote_id) return 'sent'
  if (a.upload_error === 'too_big') return 'refused'
  return uploading === a.id ? 'sending' : 'waiting'
}

export function AttachmentPlayer({
  attachment,
  onDelete,
}: {
  attachment: Attachment
  onDelete?: () => void
}) {
  const local = useBlobUrl(attachment.blob)
  const [remote, setRemote] = useState<string>()
  const [uploading, setUploading] = useState<string | null>(uploadingAttachment())
  useEffect(() => onAttachmentUpload(setUploading), [])

  // Своё видео играем из локального файла, чужое — с сервера. Тренеру
  // оригинал никогда не приезжает в базу устройства: ролики слишком тяжёлые.
  // За чужим идём отдельным шагом: файл защищён, и к ссылке нужен токен.
  const { remote_id, remote_file } = attachment
  useEffect(() => {
    if (local || !remote_id || !remote_file) return
    let alive = true
    void attachmentUrl(remote_id, remote_file).then((u) => {
      if (alive) setRemote(u)
    })
    return () => {
      alive = false
    }
  }, [local, remote_id, remote_file])

  /**
   * Токен на файл живёт минуты, а докачка длинного ролика идёт дольше: когда
   * запрос куска возвращает отказ, плеер сообщает об ошибке. Берём свежую
   * ссылку и возвращаемся на то же место — иначе видео просто перестаёт
   * играть посреди просмотра, без всякого объяснения.
   */
  const renew = async (media: HTMLMediaElement) => {
    if (local || !remote_id || !remote_file) return
    const at = media.currentTime
    const fresh = await attachmentUrl(remote_id, remote_file, true)
    setRemote(fresh)
    media.src = fresh
    media.currentTime = at
  }

  const url = local ?? remote
  if (!url) return null

  const state = uploadState(attachment, uploading)
  const isVideo = attachment.kind === 'video'
  const status =
    state === 'sent'
      ? t('у тренера')
      : state === 'sending'
        ? t('отправляю…')
        : state === 'waiting'
          ? t('ждёт отправки')
          : state === 'refused'
            ? t('не ушло')
            : ''

  return (
    <div className="mt-2">
      {attachment.kind === 'video' ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onError={(e) => void renew(e.currentTarget)}
          style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block' }}
        />
      ) : (
        <img src={url} alt={t('Техника выполнения')} style={{ width: '100%', borderRadius: 12 }} />
      )}
      <div className="row between mt-2">
        <span className="mute-sm">
          {isVideo ? t('Видео') : t('Фото')} · {(attachment.size / 1024 / 1024).toFixed(1)}{' '}
          {t('МБ')}
          {status ? ` · ${status}` : ''}
        </span>
        {onDelete && (
          <button className="icon-btn" onClick={onDelete} aria-label={t('Удалить')}>
            <IconTrash size={15} />
          </button>
        )}
      </div>
      {/* Отказ по размеру объясняем целой фразой: короткого «не ушло» мало,
          человек должен понять, что файл цел и что делать дальше. Кнопка
          рядом — потому что предел на сервере меняется, и после его подъёма
          ролик уедет с той же попытки. */}
      {state === 'refused' && (
        <div className="mt-1">
          <div className="mute-sm">
            {isVideo
              ? t('Видео на устройстве, тренеру не ушло — слишком большое для сервера')
              : t('Файл на устройстве, тренеру не ушёл — слишком большой для сервера')}
          </div>
          <button className="link" onClick={() => void retryAttachment(attachment.id)}>
            {t('Отправить ещё раз')}
          </button>
        </div>
      )}
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
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  /*
   * Доля сжатия отдельным состоянием от busy: пережатие занимает секунды и
   * без числа выглядит как зависшая кнопка. Прикрепление фото проходит мимо
   * него — там сжимать нечего, и «0 %» на долю секунды только мигнёт.
   */
  const [shrink, setShrink] = useState<number | null>(null)

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
      await addAttachment({
        sessionId,
        exerciseId,
        file,
        userId,
        onShrink: (f) => setShrink(Math.round(f * 100)),
      })
      haptics.success()
      toast(t('Видео прикреплено'))
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t('Не удалось прикрепить файл'))
    } finally {
      setBusy(false)
      setShrink(null)
      // Сбрасываем оба поля: иначе повторный выбор того же файла не
      // вызовет change и кнопка будет выглядеть сломанной.
      if (inputRef.current) inputRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  const count = (items ?? []).length

  return (
    <div style={compact ? undefined : { padding: '0 12px 12px' }}>
      {/* Два поля вместо одного: с атрибутом capture телефон открывает
          камеру сразу и в галерею уже не пускает. Снимать прямо в зале
          удобно не всегда — чаще ролик уже лежит в галерее.

          Длительность съёмки здесь ничем не ограничена и ограничить её
          отсюда нельзя: у input нет такого атрибута, capture только выбирает
          камеру. Сколько снимать, решают человек и его телефон. */}
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="video/*,image/*"
        style={{ display: 'none' }}
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {(items ?? []).map((a) => (
        <AttachmentPlayer
          key={a.id}
          attachment={a}
          onDelete={async () => {
            await deleteAttachment(a.id)
            toast(t('Видео удалено'))
          }}
        />
      ))}

      <div className="row" style={{ gap: 8, marginTop: count ? 8 : 0 }}>
        <button
          className="btn sm grow"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <IconVideo size={15} />
          {shrink !== null ? `${t('Сжимаю…')} ${shrink}%` : busy ? t('Сохраняю…') : t('Снять')}
        </button>
        <button
          className="btn sm grow"
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
        >
          <IconGallery size={15} />
          {t('Из галереи')}
        </button>
      </div>
    </div>
  )
}
