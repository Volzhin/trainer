import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Attachment,
  type Exercise,
  type ExerciseSet,
  type Feedback,
  type WorkoutSession,
} from '../db/db'
import { addFeedback, attachmentsForSession, feedbackForSession } from '../db/coach'
import { AttachmentPlayer } from './ExerciseVideo'
import { Sheet } from './Sheet'
import { IconChat, IconRecord } from './Icons'
import { formatDateTime, formatDuration, formatWeight, plural, totalVolume } from '../lib/calc'
import { estimate1RM } from '../lib/calc'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/**
 * Разбор тренировки глазами тренера: что реально было сделано по подходам,
 * плюс поле обратной связи. Без этого «проверить тренировку» сводится к
 * взгляду на тоннаж, а тренеру нужны конкретные веса и повторения.
 */
export function SessionReview({
  session,
  clientId,
  onClose,
}: {
  session: WorkoutSession | null
  clientId: string
  onClose: () => void
}) {
  const { toast, userId } = useApp()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const sets = useLiveQuery(
    async () =>
      session ? await db.sets.where('workout_session_id').equals(session.id).toArray() : [],
    [session?.id],
    [] as ExerciseSet[],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const comments = useLiveQuery(
    async () => (session ? await feedbackForSession(session.id) : []),
    [session?.id],
    [],
  )
  const media = useLiveQuery(
    async () => (session ? await attachmentsForSession(session.id) : []),
    [session?.id],
    [] as Attachment[],
  )

  if (!session) return null

  const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const grouped = new Map<number, ExerciseSet[]>()
  for (const s of sets ?? []) {
    const arr = grouped.get(s.sequence_order) ?? []
    arr.push(s)
    grouped.set(s.sequence_order, arr)
  }
  const blocks = [...grouped.entries()].sort((a, b) => a[0] - b[0])

  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await addFeedback({ clientId, sessionId: session.id, text, trainerId: userId })
      haptics.success()
      toast('Комментарий отправлен клиенту')
      setText('')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!session} title={session.title} onClose={onClose}>
      <div className="mute-sm" style={{ marginBottom: 12 }}>
        {formatDateTime(session.start_time)} ·{' '}
        {formatDuration((session.end_time ?? session.start_time) - session.start_time)} ·{' '}
        {Math.round(totalVolume(sets ?? []))} кг
      </div>

      {session.notes && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="mute-sm">Заметка клиента</div>
          <div style={{ marginTop: 4 }}>{session.notes}</div>
        </div>
      )}

      {blocks.map(([seq, rows]) => {
        const ex = exMap.get(rows[0].exercise_id)
        const sorted = rows.sort((a, b) => a.set_number - b.set_number)
        const top = sorted.reduce(
          (best, s) =>
            s.weight_kg && s.reps_completed
              ? Math.max(best, estimate1RM(s.weight_kg, s.reps_completed))
              : best,
          0,
        )
        return (
          <div className="ex-block" key={seq} style={{ marginBottom: 10 }}>
            <div className="ex-head">
              <div className="grow">
                <div className="truncate" style={{ fontWeight: 600 }}>
                  {ex?.name ?? 'Упражнение'}
                </div>
                <div className="mute-sm">
                  {sorted.length} {plural(sorted.length, ['подход', 'подхода', 'подходов'])}
                  {top > 0 && ` · лучший 1ПМ ≈ ${Math.round(top)} кг`}
                </div>
              </div>
            </div>
            {sorted.map((s) => (
              <div
                className="set-grid"
                key={s.id}
                style={{ gridTemplateColumns: '30px 1fr 1fr 52px' }}
              >
                <div className="num">{s.set_number}</div>
                <div style={{ textAlign: 'center' }}>{formatWeight(s.weight_kg)} кг</div>
                <div style={{ textAlign: 'center' }}>{s.reps_completed ?? '—'} повт.</div>
                <div style={{ textAlign: 'right' }}>
                  {s.is_pr === 1 && (
                    <span className="badge pr">
                      <IconRecord size={11} />
                      PR
                    </span>
                  )}
                </div>
              </div>
            ))}

            <ExerciseReview
              sessionId={session.id}
              clientId={clientId}
              exerciseId={rows[0].exercise_id}
              videos={(media ?? []).filter((a) => a.exercise_id === rows[0].exercise_id)}
              comments={(comments ?? []).filter((c) => c.exercise_id === rows[0].exercise_id)}
            />
          </div>
        )
      })}

      {(comments ?? []).filter((c) => !c.exercise_id).length > 0 && (
        <>
          <div className="section-title">Общие комментарии</div>
          {(comments ?? [])
            .filter((c) => !c.exercise_id)
            .map((c) => (
              <div
                key={c.id}
                className="muted"
                style={{
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: 10,
                  marginBottom: 8,
                }}
              >
                {c.text}
                <div className="mute-sm">
                  {formatDateTime(c.created_at)}
                  {c.is_read === 1 ? ' · прочитано' : ' · не прочитано'}
                </div>
              </div>
            ))}
        </>
      )}

      <div className="section-title">Итог по тренировке</div>
      <textarea
        className="textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Общий комментарий: самочувствие, нагрузка, что меняем"
      />
      <button
        className="btn primary block"
        style={{ marginTop: 10 }}
        disabled={busy || !text.trim()}
        onClick={send}
      >
        Отправить клиенту
      </button>
    </Sheet>
  )
}

/** Видео техники по упражнению и комментарий именно к нему. */
function ExerciseReview({
  sessionId,
  clientId,
  exerciseId,
  videos,
  comments,
}: {
  sessionId: string
  clientId: string
  exerciseId: string
  videos: Attachment[]
  comments: Feedback[]
}) {
  const { toast, userId } = useApp()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const send = async () => {
    if (!text.trim()) return
    await addFeedback({ clientId, sessionId, exerciseId, text, trainerId: userId })
    haptics.success()
    toast('Разбор отправлен')
    setText('')
    setOpen(false)
  }

  return (
    <div style={{ padding: '4px 12px 12px' }}>
      {videos.map((a) => (
        <AttachmentPlayer key={a.id} attachment={a} />
      ))}

      {comments.map((c) => (
        <div
          key={c.id}
          className="mute-sm"
          style={{
            borderLeft: '2px solid var(--accent)',
            paddingLeft: 10,
            marginTop: 8,
            color: 'var(--text-2)',
          }}
        >
          {c.text}
          {c.is_read === 0 && (
            <span className="badge" style={{ marginLeft: 8 }}>
              не прочитано
            </span>
          )}
        </div>
      ))}

      {open ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что поправить в технике"
            autoFocus
          />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm grow" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button className="btn sm primary grow" disabled={!text.trim()} onClick={send}>
              Отправить
            </button>
          </div>
        </div>
      ) : (
        <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
          <IconChat size={15} />
          {videos.length ? 'Разобрать технику' : 'Комментарий к упражнению'}
        </button>
      )}
    </div>
  )
}
