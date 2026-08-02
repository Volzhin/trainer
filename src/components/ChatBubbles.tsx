import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../db/db'
import { formatClock } from '../lib/calc'
import { IconPaperclip, IconPause, IconPlay } from './Icons'

/** Blob из базы → временный URL, который освобождаем при размонтировании. */
export function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/**
 * Голосовое: столбики огибающей закрашиваются по мере проигрывания —
 * так видно и длину сообщения, и позицию воспроизведения.
 */
export function VoiceBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const url = useBlobUrl(message.blob)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  const total = message.duration ?? 0
  const bars = message.waveform?.length ? message.waveform : Array(28).fill(0.35)
  const progress = total ? Math.min(1, position / total) : 0

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  return (
    <div className="row" style={{ gap: 10, minWidth: 190 }}>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setPosition(0)
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        preload="metadata"
      />
      <button className="voice-play" onClick={toggle} aria-label={playing ? 'Пауза' : 'Слушать'}>
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>

      <div className="grow">
        <div className="wave" onClick={toggle}>
          {bars.map((v, i) => (
            <i
              key={i}
              style={{
                height: `${Math.max(12, v * 100)}%`,
                opacity: i / bars.length <= progress ? 1 : 0.38,
              }}
            />
          ))}
        </div>
        <div className="bubble-meta">
          {formatClock(Math.round(playing || position ? total - position : total))} · {timeOf(message.created_at)}
          {mine && (message.is_read ? ' · прочитано' : '')}
        </div>
      </div>
    </div>
  )
}

/** Видеокружок: круглая обрезка, воспроизведение по нажатию. */
export function CircleBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const url = useBlobUrl(message.blob)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  return (
    <div>
      <div className="circle-video" onClick={toggle}>
        <video
          ref={videoRef}
          src={url}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        {!playing && (
          <span className="circle-play">
            <IconPlay size={20} />
          </span>
        )}
      </div>
      <div className="bubble-meta" style={{ textAlign: mine ? 'right' : 'left', marginTop: 4 }}>
        {message.duration ? `${Math.round(message.duration)} сек · ` : ''}
        {timeOf(message.created_at)}
      </div>
    </div>
  )
}

export function ImageBubble({ message }: { message: ChatMessage }) {
  const url = useBlobUrl(message.blob)
  if (!url) return null
  return (
    <div>
      <img src={url} alt={message.file_name ?? 'Изображение'} className="chat-image" />
      <div className="bubble-meta">{timeOf(message.created_at)}</div>
    </div>
  )
}

export function FileBubble({ message }: { message: ChatMessage }) {
  const url = useBlobUrl(message.blob)
  const size = message.size ? `${(message.size / 1024 / 1024).toFixed(1)} МБ` : ''

  return (
    <a
      href={url}
      download={message.file_name}
      className="row"
      style={{ gap: 10, minWidth: 180, alignItems: 'center' }}
    >
      <span className="file-icon">
        <IconPaperclip size={18} />
      </span>
      <span className="grow">
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }} className="truncate">
          {message.file_name ?? 'Файл'}
        </span>
        <span className="bubble-meta">
          {size} · {timeOf(message.created_at)}
        </span>
      </span>
    </a>
  )
}

export function TextBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>{message.text}</div>
      <div className="bubble-meta">
        {timeOf(message.created_at)}
        {mine && (message.is_read ? ' · прочитано' : '')}
      </div>
    </div>
  )
}
