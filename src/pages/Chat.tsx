import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ChatMessage } from '../db/db'
import { listThread, markThreadRead, sendMedia, sendText, deleteMessage } from '../db/chat'
import { trainerOfClient } from '../db/coach'
import { recordCircle, recordVoice, recordingSupported, type Recording } from '../lib/recorder'
import {
  CircleBubble,
  FileBubble,
  ImageBubble,
  TextBubble,
  VoiceBubble,
} from '../components/ChatBubbles'
import {
  IconBack,
  IconChat,
  IconCircleDot,
  IconMic,
  IconPaperclip,
  IconTrash,
} from '../components/Icons'
import { formatDate, formatClock } from '../lib/calc'
import { useApp, useProfile } from '../store/app'
import { haptics } from '../lib/native'

type Mode = 'idle' | 'voice' | 'circle'

/**
 * Переписка. Экран один для обеих сторон: кто тренер, а кто клиент,
 * определяется ролью активного аккаунта, а не отдельными компонентами.
 */
export function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const profile = useProfile()

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<Recording | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)

  const isTrainer = profile?.role === 'TRAINER'
  // У тренера собеседник задан маршрутом, у клиента — единственной связкой.
  const bond = useLiveQuery(async () => (isTrainer ? null : await trainerOfClient(userId)), [
    isTrainer,
    userId,
  ])

  const trainerId = isTrainer ? userId : bond?.trainer.id
  const clientId = isTrainer ? id : userId

  const peer = useLiveQuery(
    async () => (isTrainer ? (id ? await db.profile.get(id) : undefined) : bond?.trainer),
    [isTrainer, id, bond?.trainer.id],
  )

  const version = useLiveQuery(() => db.chat.count(), [])
  const messages = useLiveQuery(
    async () => (trainerId && clientId ? await listThread(trainerId, clientId) : []),
    [trainerId, clientId, version],
    [] as ChatMessage[],
  )

  // Прочитанность снимаем при открытии и на каждое новое сообщение.
  useEffect(() => {
    if (trainerId && clientId) void markThreadRead(trainerId, clientId)
  }, [trainerId, clientId, version])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  // Счётчик и индикатор громкости во время записи.
  useEffect(() => {
    if (mode === 'idle') return
    const t = setInterval(() => {
      const rec = recRef.current
      if (!rec) return
      setElapsed(rec.elapsed())
      setLevel(rec.level())
    }, 100)
    return () => clearInterval(t)
  }, [mode])

  if (!trainerId || !clientId) {
    return (
      <div className="screen">
        <div className="empty">
          <div className="big">
            <IconChat size={34} />
          </div>
          Чат доступен, когда подключён тренер.
        </div>
        <button className="btn block" onClick={() => nav(-1)}>
          Назад
        </button>
      </div>
    )
  }

  const base = {
    trainerId,
    clientId,
    authorRole: (isTrainer ? 'TRAINER' : 'CLIENT') as 'TRAINER' | 'CLIENT',
  }

  const submitText = async () => {
    const value = text.trim()
    if (!value) return
    setText('')
    await sendText(base, value)
    haptics.selection()
  }

  const beginRecording = async (kind: 'voice' | 'circle') => {
    if (!recordingSupported()) {
      toast('Браузер не умеет записывать медиа')
      return
    }
    try {
      const rec = kind === 'voice' ? await recordVoice() : await recordCircle()
      recRef.current = rec
      setMode(kind)
      setElapsed(0)
      haptics.impact()
      if (kind === 'circle' && previewRef.current) {
        previewRef.current.srcObject = rec.stream
        void previewRef.current.play()
      }
    } catch {
      toast(kind === 'voice' ? 'Нет доступа к микрофону' : 'Нет доступа к камере')
    }
  }

  const finishRecording = async () => {
    const rec = recRef.current
    if (!rec) return
    const kind = mode
    setMode('idle')
    recRef.current = null
    const result = await rec.stop()

    if (result.duration < 0.6) {
      toast('Слишком коротко')
      return
    }
    await sendMedia(base, kind === 'circle' ? 'circle' : 'voice', result.blob, {
      duration: result.duration,
      waveform: kind === 'voice' ? result.waveform : undefined,
    })
    haptics.success()
  }

  const cancelRecording = () => {
    recRef.current?.cancel()
    recRef.current = null
    setMode('idle')
  }

  const attach = async (file?: File) => {
    if (!file) return
    try {
      const kind = file.type.startsWith('image/') ? 'image' : 'file'
      await sendMedia(base, kind, file, { fileName: file.name })
      haptics.success()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось приложить файл')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  let lastDay = ''

  return (
    <div className="chat-screen">
      <div className="chat-head">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <div style={{ fontWeight: 600 }} className="truncate">
            {peer?.name ?? 'Диалог'}
          </div>
          <div className="mute-sm">
            {isTrainer ? 'клиент' : peer?.specialization ?? 'тренер'}
          </div>
        </div>
      </div>

      <div className="chat-body">
        {(messages ?? []).length === 0 && (
          <div className="empty">
            <div className="big">
              <IconChat size={34} />
            </div>
            Напишите первое сообщение, запишите голосовое или кружок.
          </div>
        )}

        {(messages ?? []).map((m) => {
          const mine = m.author_id === userId
          const day = formatDate(m.created_at)
          const showDay = day !== lastDay
          lastDay = day

          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={`bubble-row${mine ? ' mine' : ''}`}>
                <div
                  className={`bubble${mine ? ' mine' : ''}${
                    m.kind === 'circle' ? ' bare' : ''
                  }`}
                  onDoubleClick={() => mine && deleteMessage(m.id)}
                  title={mine ? 'Двойное нажатие — удалить' : undefined}
                >
                  {m.kind === 'text' && <TextBubble message={m} mine={mine} />}
                  {m.kind === 'voice' && <VoiceBubble message={m} mine={mine} />}
                  {m.kind === 'circle' && <CircleBubble message={m} mine={mine} />}
                  {m.kind === 'image' && <ImageBubble message={m} />}
                  {m.kind === 'file' && <FileBubble message={m} />}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {mode !== 'idle' ? (
        <div className="chat-input recording">
          {mode === 'circle' && (
            <video ref={previewRef} muted playsInline className="circle-preview" />
          )}
          <button className="icon-btn" onClick={cancelRecording} aria-label="Отменить">
            <IconTrash size={17} />
          </button>
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <span className="rec-dot" />
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatClock(Math.floor(elapsed))}
              </span>
              <span className="grow mute-sm">
                {mode === 'voice' ? 'Идёт запись голосового' : 'Идёт запись кружка'}
              </span>
            </div>
            <div className="level">
              <i style={{ width: `${Math.min(100, level * 160)}%` }} />
            </div>
          </div>
          <button className="btn primary sm" onClick={finishRecording}>
            Отправить
          </button>
        </div>
      ) : (
        <div className="chat-input">
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => attach(e.target.files?.[0])}
          />
          <button
            className="icon-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Прикрепить файл"
          >
            <IconPaperclip size={18} />
          </button>

          <input
            className="input grow"
            placeholder="Сообщение"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitText()}
          />

          {text.trim() ? (
            <button className="btn primary sm" onClick={submitText}>
              Отправить
            </button>
          ) : (
            <>
              <button
                className="icon-btn"
                onClick={() => beginRecording('voice')}
                aria-label="Записать голосовое"
              >
                <IconMic size={18} />
              </button>
              <button
                className="icon-btn"
                onClick={() => beginRecording('circle')}
                aria-label="Записать кружок"
              >
                <IconCircleDot size={18} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
