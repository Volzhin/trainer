import { useEffect, useState, type ReactNode } from 'react'
import type { NutritionDay, ReviewTarget, WorkoutReport } from '../db/db'
import { replyFor, replyText, reviewReport } from '../db/reports'
import { formatDate } from '../lib/calc'
import { Sheet } from './Sheet'
import { SATIETY_LABELS } from './NutritionDayReport'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Разбор одного отчёта — тренировки или дня питания.
 *
 * Один лист на оба вида намеренно: разбор устроен одинаково — тренер
 * читает, что прислал клиент, и отвечает ему. Две копии этого диалога
 * разошлись бы в формулировках, и клиент получал бы разные по тону ответы
 * в зависимости от того, о чём отчитывался.
 */

export type ReviewSubject = {
  target: ReviewTarget
  /** id отчёта о тренировке либо дата дня питания. */
  ref: string
  title: string
  subtitle: string
  /** Что написал клиент, сдавая отчёт. */
  comment?: string
  /** Что тренер уже отвечал — ответ можно поправить. */
  reply?: string
  submittedAt?: number
}

export const toWorkoutSubject = (r: WorkoutReport, title?: string): ReviewSubject => ({
  target: 'workout',
  ref: r.id,
  title: title ?? 'Тренировка',
  subtitle: r.submitted_at ? `Сдана ${formatDate(r.submitted_at)}` : 'Сдана',
  comment: r.client_comment,
  reply: r.trainer_comment,
  submittedAt: r.submitted_at,
})

export const toDaySubject = (d: NutritionDay): ReviewSubject => ({
  target: 'nutrition',
  ref: d.date,
  title: `Питание · ${formatDate(new Date(`${d.date}T12:00:00`).getTime())}`,
  subtitle: d.satiety ? `Сытость: ${SATIETY_LABELS[d.satiety]}` : 'День питания',
  comment: d.comment,
  reply: d.trainer_comment,
  submittedAt: d.submitted_at,
})

export function ReviewSheet({
  subject,
  clientId,
  trainerId,
  context,
  onClose,
  onDone,
}: {
  subject: ReviewSubject | null
  clientId: string
  trainerId: string
  /**
   * Что показать над отчётом: цели, цифры дня — всё, при чём тренер и
   * судит. Слот, а не готовая разметка: у тренировки и дня питания
   * контекст разный, а сам разбор одинаковый.
   */
  context?: ReactNode
  onClose: () => void
  onDone: () => void
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  /**
   * Ответ живёт отдельной строкой, а не в самом отчёте: пока он лежал внутри
   * него, обмен, разбирающий конфликты строкой целиком, стирал им правку
   * клиента. Поле в отчёте читается запасным вариантом — там остались
   * ответы, написанные до разделения; пустая строка в reportReplies означает
   * снятый ответ и перекрывает его.
   */
  useEffect(() => {
    if (!subject) return
    let alive = true
    void replyFor(clientId, subject.target, subject.ref).then((saved) => {
      if (alive) setReply(replyText(saved, subject.reply) ?? '')
    })
    return () => {
      alive = false
    }
  }, [clientId, subject?.target, subject?.ref])

  if (!subject) return null

  const send = async () => {
    setBusy(true)
    try {
      await reviewReport({
        clientId,
        trainerId,
        target: subject.target,
        ref: subject.ref,
        comment: reply,
      })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!subject} title={subject.title} onClose={onClose}>
      <div className="mute-sm">{subject.subtitle}</div>

      {context && <div className="mt-3">{context}</div>}

      {subject.comment && (
        <div className="card mt-3">
          <div className="mute-sm">{t('Что написал клиент')}</div>
          <div className="mt-1">{subject.comment}</div>
        </div>
      )}

      <div className="stack mt-4">
        <div className="field">
          <label>{t('Ответ клиенту')}</label>
          <textarea
            className="textarea"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('Что получилось, что меняем к следующему разу')}
          />
        </div>
        {/* Отметка о проверке ставится и без ответа: пустой ответ — это
            «посмотрел, вопросов нет», и клиенту про это знать нечего. */}
        <button className="btn primary block" disabled={busy} onClick={send}>
          {reply.trim() ? 'Ответить и отметить разобранным' : 'Отметить разобранным'}
        </button>
      </div>
    </Sheet>
  )
}
