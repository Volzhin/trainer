import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listBodyMetrics, logBodyMetric } from '../db/repo'
import { LineChart } from './LineChart'
import { Sheet } from './Sheet'
import { IconPlus } from './Icons'
import { formatDate, formatWeight } from '../lib/calc'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Вес — отдельная от полного замера привычка: взвешиваются чаще, чем меряют
 * состав тела, и не хотят каждый раз идти через обхваты и отчёты InBody.
 * Пишет и читает ту же таблицу bodyMetrics (замер с одним полем — тоже
 * законный замер), просто даёт короткий путь и свой график.
 */
export function WeightCard({ userId }: { userId: string }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const metrics = useLiveQuery(() => listBodyMetrics(userId), [userId])

  const points = useMemo(
    () =>
      (metrics ?? [])
        .filter((m) => m.weight_kg != null)
        .sort((a, b) => a.logged_at - b.logged_at)
        .map((m) => ({ x: m.logged_at, y: m.weight_kg as number })),
    [metrics],
  )

  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const delta = latest && previous ? round1(latest.y - previous.y) : null

  return (
    <>
      <div className="card">
        {latest ? (
          <>
            <div className="row between">
              <div>
                <div className="t-num" style={{ fontSize: 28 }}>
                  {formatWeight(latest.y)}{' '}
                  <span className="mute-sm" style={{ fontSize: 14 }}>
                    {t('кг')}
                  </span>
                </div>
                <div className="mute-sm mt-1">{formatDate(latest.x)}</div>
              </div>
              {delta != null && delta !== 0 && (
                <span
                  className="t-num"
                  style={{ color: delta > 0 ? 'var(--warn)' : 'var(--ok)' }}
                >
                  {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} кг
                </span>
              )}
            </div>
            {points.length > 1 && (
              <div className="mt-3">
                <LineChart data={points.slice(-30)} unit=" кг" height={90} />
              </div>
            )}
          </>
        ) : (
          <div className="muted">{t('Ещё не взвешивались — запишите первый вес.')}</div>
        )}
        <button className="btn block mt-3" onClick={() => setOpen(true)}>
          <IconPlus size={16} /> Записать вес
        </button>
      </div>

      <WeightSheet
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => toast('Вес записан')}
      />
    </>
  )
}

export function WeightSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const n = parseFloat(weight.replace(',', '.'))
    if (!Number.isFinite(n)) return
    setBusy(true)
    try {
      await logBodyMetric({ weight_kg: n })
      setWeight('')
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={t('Записать вес')} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>{t('Вес, кг')}</label>
          <input
            className="input"
            inputMode="decimal"
            autoFocus
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="78,5"
          />
        </div>
        <button className="btn primary block" disabled={busy || !weight} onClick={submit}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </Sheet>
  )
}
