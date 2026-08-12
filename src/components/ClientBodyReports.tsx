import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { reviewedRefs, submittedBodyDays } from '../db/reports'
import { formatDate } from '../lib/calc'
import { ReportCalendar, type ReportState } from './ReportCalendar'
import { ReviewSheet, type ReviewSubject } from './ReviewSheet'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

/**
 * Сданные замеры по дням — тот же календарь, что у тренировок и питания.
 *
 * Замеры клиент сдаёт так же, как остальное, и тренер должен видеть, что
 * уже разобрал, а что нет. Раньше вкладка «Тело» показывала только цифры:
 * по ним нельзя было понять, обсуждали этот замер или он лежит нетронутым
 * третью неделю.
 */
export function ClientBodyReports({ clientId }: { clientId: string }) {
  const { toast, userId } = useApp()
  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)

  const version = useLiveQuery(
    async () => [await db.bodyMetrics.count(), await db.reviews.count()],
    [clientId],
  )
  const days = useLiveQuery(() => submittedBodyDays(clientId), [clientId, version?.join('-')])
  const seen = useLiveQuery(() => reviewedRefs(clientId, 'body'), [clientId, version?.join('-')])

  const states = useMemo(() => {
    const map = new Map<string, ReportState>()
    for (const d of days ?? []) map.set(d.date, seen?.has(d.date) ? 'reviewed' : 'submitted')
    return map
  }, [days, seen])

  if (!days || !seen) return <div className="card skeleton" style={{ height: 220 }} />
  if (days.length === 0) return null

  return (
    <>
      <div className="section-title">{t('Сданные замеры')}</div>
      <div className="card">
        <ReportCalendar
          states={states}
          onPick={(date) => {
            const day = days.find((d) => d.date === date)
            if (!day) return
            setReviewing({
              target: 'body',
              ref: day.date,
              title: `${t('Замеры')} · ${formatDate(day.at)}`,
              subtitle: t('Замеры'),
              reply: day.comment,
              submittedAt: day.at,
            })
          }}
        />
        <div className="mute-sm mt-3">
          {t('Нажмите на день, чтобы прочитать отчёт и ответить клиенту.')}
        </div>
      </div>

      <ReviewSheet
        subject={reviewing}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setReviewing(null)}
        onDone={() => toast(t('Отчёт разобран'))}
      />
    </>
  )
}
