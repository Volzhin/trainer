import { useApp, useRestLeft } from '../store/app'
import { formatClock } from '../lib/calc'
import { IconClose } from './Icons'
import { t } from '../lib/i18n'

export function RestTimer() {
  const { rest, addRest, stopRest } = useApp()
  const restLeft = useRestLeft()
  if (!rest) return null

  const pct = Math.max(0, Math.min(100, (restLeft / rest.total) * 100))

  return (
    <div className="rest-bar">
      <div className="rest-inner">
        <div className="grow">
          <div className="row between">
            <span className="rest-time">{formatClock(restLeft)}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => addRest(-15)}>
                −15
              </button>
              <button className="btn sm" onClick={() => addRest(15)}>
                +15
              </button>
              <button className="icon-btn" onClick={stopRest} aria-label={t('Пропустить отдых')}>
                <IconClose size={18} />
              </button>
            </div>
          </div>
          <div className="rest-progress">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="mute-sm" style={{ marginTop: 5 }}>
            Отдых{rest.label ? ` · далее: ${rest.label}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
