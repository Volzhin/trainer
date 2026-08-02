import { useState } from 'react'
import type { Exercise } from '../db/db'

/**
 * Демонстрация техники. Приоритет — прямой видеофайл: он играет во
 * встроенном плеере, без внешнего сервиса и без автозагрузки чужих скриптов.
 * Если его нет, показываем превью со ссылкой на исходный ролик.
 */
export function ExerciseMedia({ exercise }: { exercise: Exercise }) {
  const [playing, setPlaying] = useState(false)
  const { image_url, clip_url, video_url, name } = exercise

  if (!image_url && !clip_url && !video_url) return null

  const frame: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 12,
    background: 'var(--bg-elev-2)',
    border: '1px solid var(--line)',
    objectFit: 'cover',
    display: 'block',
  }

  if (clip_url && playing) {
    return (
      <video
        src={clip_url}
        poster={image_url}
        controls
        autoPlay
        playsInline
        loop
        style={{ ...frame, background: '#000' }}
      />
    )
  }

  return (
    <div style={{ position: 'relative' }} className="enter">
      {image_url ? (
        <img src={image_url} alt={name} style={frame} loading="lazy" />
      ) : (
        <div style={{ ...frame, display: 'grid', placeItems: 'center', color: 'var(--text-mute)' }}>
          Нет превью
        </div>
      )}

      {clip_url ? (
        <button
          onClick={() => setPlaying(true)}
          aria-label="Смотреть технику"
          style={playButton}
        >
          ▶
        </button>
      ) : (
        video_url && (
          <a href={video_url} target="_blank" rel="noreferrer" style={playButton}>
            ▶
          </a>
        )
      )}
    </div>
  )
}

const playButton: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  margin: 'auto',
  width: 56,
  height: 56,
  borderRadius: '50%',
  background: 'rgba(12, 15, 19, 0.62)',
  color: '#fff',
  fontSize: 20,
  display: 'grid',
  placeItems: 'center',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.3)',
}
