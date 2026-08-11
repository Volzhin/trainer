import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ExerciseSet } from '../db/db'
import { useExercises } from '../db/catalog'
import { deleteSession } from '../db/repo'
import { feedbackForSession, markFeedbackRead } from '../db/coach'
import { VideoUploader } from '../components/ExerciseVideo'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { IconBack, IconChat, IconRecord, IconTrash, IconVideo } from '../components/Icons'
import { formatDateTime, formatDuration, formatWeight, plural, totalVolume } from '../lib/calc'
import { useApp, useClientMode } from '../store/app'

export function SessionDetail() {
  const { id = '' } = useParams()
  const [techniqueFor, setTechniqueFor] = useState<string | null>(null)
  const nav = useNavigate()
  const { toast } = useApp()

  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const sets = useLiveQuery(
    () => db.sets.where('workout_session_id').equals(id).toArray(),
    [id],
    [] as ExerciseSet[],
  )
  const exercises = useExercises()
  const comments = useLiveQuery(() => feedbackForSession(id), [id], [])
  const attachments = useLiveQuery(
    () => db.attachments.where('session_id').equals(id).toArray(),
    [id],
    [],
  )
  // Видео-отчёт есть только в онлайн-режиме: очного клиента тренер видит
  // на занятии своими глазами, и просить у него запись — просить лишнего.
  // Тот же признак решает дело на экране самой тренировки (LiveSession).
  const videoReport = useClientMode() === 'online'

  // Открыв тренировку, клиент прочитал комментарий — снимаем отметку у тренера.
  useEffect(() => {
    if (comments?.some((c) => c.is_read === 0)) void markFeedbackRead(id)
  }, [comments, id])

  if (!session) return <div className="screen">Загрузка…</div>

  const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const grouped = new Map<number, ExerciseSet[]>()
  for (const s of sets ?? []) {
    const arr = grouped.get(s.sequence_order) ?? []
    arr.push(s)
    grouped.set(s.sequence_order, arr)
  }
  const blocks = [...grouped.entries()].sort((a, b) => a[0] - b[0])
  const volume = totalVolume(sets ?? [])

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{session.title}</h1>
          <div className="sub">{formatDateTime(session.start_time)}</div>
        </div>
        <button
          className="icon-btn"
          onClick={async () => {
            await deleteSession(id)
            toast('Тренировка удалена')
            nav('/', { replace: true })
          }}
          aria-label="Удалить"
        >
          <IconTrash size={17} />
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">
            {formatDuration((session.end_time ?? session.start_time) - session.start_time)}
          </div>
          <div className="label">длительность</div>
        </div>
        <div className="stat">
          <div className="value">{Math.round(volume)} кг</div>
          <div className="label">тоннаж</div>
        </div>
      </div>

      {session.notes && (
        <div className="card mt-3">
          <div className="mute-sm">Заметка</div>
          <div className="mt-1">{session.notes}</div>
        </div>
      )}

      {(comments ?? []).filter((c) => !c.exercise_id && c.text.trim()).length > 0 && (
        <>
          <div className="section-title">Комментарий тренера</div>
          {(comments ?? [])
            .filter((c) => !c.exercise_id && c.text.trim())
            .map((c) => (
              <div className="card" key={c.id} style={{ borderColor: 'var(--accent)' }}>
                <div className="row mb-2">
                  <IconChat size={16} />
                  <span className="mute-sm">{formatDateTime(c.created_at)}</span>
                </div>
                {c.text}
              </div>
            ))}
        </>
      )}

      {/* Видео чаще снимают в зале, а раскладывают по упражнениям уже дома.
          Подсказка нужна, чтобы человек знал: тренировка закрыта, но отчёт
          ещё можно дослать. */}
      {videoReport && (attachments ?? []).length === 0 && (
        <div className="card mt-3">
          <div className="row mb-1">
            <IconVideo size={16} />
            <span className="strong">Видеоотчёт</span>
          </div>
          <div className="mute-sm">
            Тренировка уже сохранена. Ролики можно прикрепить к любому упражнению ниже — хоть
            сейчас, хоть вечером.
          </div>
        </div>
      )}

      <div className="section-title">Упражнения</div>
      {blocks.map(([seq, rows]) => {
        const ex = exMap.get(rows[0].exercise_id)
        return (
          <div className="ex-block" key={seq}>
            <div className="ex-head">
              <button
                className="row grow"
                style={{ textAlign: 'left', gap: 10 }}
                onClick={() => ex && setTechniqueFor(ex.id)}
              >
                {ex?.image_url ? (
                  <img src={ex.image_url} alt="" className="ex-thumb" loading="lazy" />
                ) : (
                  <span className="ex-thumb placeholder" />
                )}
                <span className="grow">
                  <span className="truncate strong" style={{ display: 'block' }}>
                    {ex?.name ?? 'Упражнение'}
                  </span>
                  <span className="mute-sm">
                    {rows.length} {plural(rows.length, ['подход', 'подхода', 'подходов'])} · как
                    делать
                  </span>
                </span>
              </button>
            </div>
            {rows
              .sort((a, b) => a.set_number - b.set_number)
              .map((s) => (
                <div
                  className="set-grid"
                  key={s.id}
                  style={{ gridTemplateColumns: '34px 1fr 1fr 60px' }}
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

            <div style={{ padding: '4px 12px 12px' }}>
              {/* Пустые записи пропускаем: строка обратной связи заводится и
                  ради одной рекомендации по весу, без текста — рисовать под
                  неё рамку «разбор техники» не из чего. */}
              {(comments ?? [])
                .filter((c) => c.exercise_id === rows[0].exercise_id && c.text.trim())
                .map((c) => (
                  <div
                    key={c.id}
                    className="muted quote mb-2"
                  >
                    <div className="mute-sm">Разбор техники от тренера</div>
                    {c.text}
                  </div>
                ))}
              {videoReport && (
                <VideoUploader sessionId={id} exerciseId={rows[0].exercise_id} compact />
              )}
            </div>
          </div>
        )
      })}

      <ExerciseTechniqueSheet exerciseId={techniqueFor} onClose={() => setTechniqueFor(null)} />
    </div>
  )
}
