import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Attachment,
  type ExerciseSet,
  type Feedback,
  type Progression,
  type WorkoutSession,
} from '../db/db'
import { useExercises } from '../db/catalog'
import {
  addFeedback,
  addTrainerPhoto,
  attachmentsForSession,
  feedbackForSession,
} from '../db/coach'
import { markReportReviewed, progressionFor, setExerciseProgression } from '../db/reports'
import { AttachmentPlayer } from './ExerciseVideo'
import { Sheet } from './Sheet'
import { IconChat, IconGallery, IconRecord } from './Icons'
import { formatDateTime, formatDuration, formatWeight, plural, totalVolume } from '../lib/calc'
import { estimate1RM } from '../lib/calc'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

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
  const exercises = useExercises()
  const comments = useLiveQuery(
    async () => (session ? await feedbackForSession(session.id) : []),
    [session?.id],
    [],
  )
  // Отчёт нужен, чтобы поставить отметку о разборе: она живёт не в самой
  // тренировке, а в строке отчёта, которая и красит клетку календаря.
  const report = useLiveQuery(
    async () =>
      session ? await db.workoutReports.where('session_id').equals(session.id).first() : undefined,
    [session?.id],
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

  /**
   * Отправить итог и закрыть разбор.
   *
   * Отметка ставится здесь же, а не отдельной кнопкой в другой вкладке:
   * тренер, разобравший тренировку по упражнениям, вправе считать её
   * разобранной — иначе клетка в календаре остаётся жёлтой, и он ищет, что
   * ещё от него хотят.
   *
   * Общий комментарий необязателен: разбор мог целиком уместиться в
   * указания по упражнениям, а «посмотрел, вопросов нет» — тоже разбор.
   */
  const send = async () => {
    setBusy(true)
    try {
      if (text.trim()) {
        await addFeedback({ clientId, sessionId: session.id, text, trainerId: userId })
      }
      if (report) {
        await markReportReviewed({ clientId, target: 'workout', ref: report.id })
      }
      haptics.success()
      toast(text.trim() ? t('Отправлено, тренировка разобрана') : t('Тренировка разобрана'))
      setText('')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!session} title={t(session.title)} onClose={onClose}>
      <div className="mute-sm mb-3">
        {formatDateTime(session.start_time)} ·{' '}
        {formatDuration((session.end_time ?? session.start_time) - session.start_time)} ·{' '}
        {Math.round(totalVolume(sets ?? []))} {t('кг')}
      </div>

      {session.notes && (
        <div className="card mb-3">
          <div className="mute-sm">{t('Заметка клиента')}</div>
          <div className="mt-1">{session.notes}</div>
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
          <div className="ex-block" key={seq} style={{ marginBottom: 12 }}>
            <div className="ex-head">
              <div className="grow">
                <div className="truncate strong">
                  {exName(ex?.name) || t('Упражнение')}
                </div>
                <div className="mute-sm">
                  {sorted.length} {plural(sorted.length, ['подход', 'подхода', 'подходов'])}
                  {top > 0 && ` · ${t('лучший 1ПМ')} ≈ ${Math.round(top)} ${t('кг')}`}
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
                <div style={{ textAlign: 'center' }}>{formatWeight(s.weight_kg)} {t('кг')}</div>
                <div style={{ textAlign: 'center' }}>{s.reps_completed ?? '—'} {t('повт.')}</div>
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
          <div className="section-title">{t('Общие комментарии')}</div>
          {(comments ?? [])
            .filter((c) => !c.exercise_id)
            .map((c) => (
              <div
                key={c.id}
                className="muted quote mb-2"
              >
                {c.text}
                <div className="mute-sm">
                  {formatDateTime(c.created_at)}
                  {c.is_read === 1 ? ` · ${t('прочитано')}` : ` · ${t('не прочитано')}`}
                </div>
              </div>
            ))}
        </>
      )}

      <div className="section-title">{t('Итог по тренировке')}</div>
      <textarea
        className="textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('Общий комментарий: самочувствие, нагрузка, что меняем')}
      />
      <button className="btn primary block mt-3" disabled={busy} onClick={send}>
        {text.trim() ? t('Отправить и отметить разобранным') : t('Отметить разобранным')}
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
  const [progression, setProgression] = useState<Progression | null>(null)
  // Фото прикладывается к тому же комментарию: показать угол в спине проще
  // снимком, чем описать словами.
  const [photo, setPhoto] = useState<File | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // Что тренер уже говорил про вес по этому упражнению — чтобы не выставлять
  // вслепую и видеть, что рекомендация дошла.
  const current = useLiveQuery(
    () => progressionFor(exerciseId, clientId),
    [exerciseId, clientId],
  )

  /**
   * Рекомендация по весу отправляется сразу по нажатию, без кнопки
   * «сохранить»: это выбор из трёх, и подтверждать его нечем — промах
   * исправляется тем же нажатием на соседний вариант.
   */
  const setWeightAdvice = async (value: Progression) => {
    setProgression(value)
    await setExerciseProgression({
      clientId,
      sessionId,
      exerciseId,
      progression: value,
      trainerId: userId,
    })
    haptics.selection()
    toast(t('Рекомендация по весу отправлена'))
  }

  const send = async () => {
    if (!text.trim() && !photo) return
    if (photo) {
      await addTrainerPhoto({ clientId, sessionId, exerciseId, file: photo })
    }
    if (text.trim()) {
      await addFeedback({ clientId, sessionId, exerciseId, text, trainerId: userId })
    }
    haptics.success()
    toast(t('Разбор отправлен'))
    setText('')
    setPhoto(null)
    setOpen(false)
  }

  return (
    <div style={{ padding: '4px 12px 12px' }}>
      {videos.map((a) => (
        <AttachmentPlayer key={a.id} attachment={a} />
      ))}

      {comments
        .filter((c) => c.text.trim())
        .map((c) => (
        <div
          key={c.id}
          className="muted quote mt-2"
        >
          {c.text}
          {c.is_read === 0 && (
            <span className="badge" style={{ marginLeft: 8 }}>
              {t('не прочитано')}
            </span>
          )}
        </div>
      ))}

      {/* Пункт 5.5: переключатель прогрессии веса. Стоит рядом с разбором
          техники, потому что решение о весе тренер принимает, глядя на то
          же видео и те же подходы. */}
      <div className="mt-3">
        <div className="mute-sm mb-1">{t('Вес в следующий раз')}</div>
        <div className="segmented">
          {(
            [
              ['decrease', 'Снизить'],
              ['keep', 'Оставить'],
              ['increase', 'Прибавить'],
            ] as const
          ).map(([value, label]) => {
            const active = (progression ?? current?.progression) === value
            return (
              <button
                key={value}
                className={active ? 'on' : ''}
                onClick={() => void setWeightAdvice(value)}
              >
                {t(label)}
              </button>
            )
          })}
        </div>
      </div>

      {open ? (
        <div className="stack mt-2">
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Что поправить в технике')}
            autoFocus
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          <button className="btn sm block" onClick={() => photoRef.current?.click()}>
            <IconGallery size={15} />
            {photo ? photo.name : t('Приложить фото')}
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn sm grow"
              onClick={() => {
                setPhoto(null)
                setOpen(false)
              }}
            >
              {t('Отмена')}
            </button>
            <button
              className="btn sm primary grow"
              disabled={!text.trim() && !photo}
              onClick={send}
            >
              {t('Отправить')}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn sm block mt-2" onClick={() => setOpen(true)}>
          <IconChat size={15} />
          {videos.length ? t('Разобрать технику') : t('Комментарий к упражнению')}
        </button>
      )}
    </div>
  )
}
