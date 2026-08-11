import { useState } from 'react'
import type { Consent, ConsentKind } from '../db/db'
import {
  CONSENTS_ARE_PLACEHOLDER,
  CONSENT_DOCS,
  consentDoc,
  currentConsents,
} from '../lib/consents'
import { Sheet } from './Sheet'
import { IconBack, IconCheck } from './Icons'

/**
 * Подписание оферты и согласия на обработку данных.
 *
 * Отдельный шаг, а не галочка под кнопкой: по пункту 6 без подписей связи
 * не существует, и человек должен иметь возможность прочитать то, под чем
 * подписывается. Текст открывается здесь же — ссылка «наружу» на этом шаге
 * увела бы его из формы, к которой он может и не вернуться.
 *
 * Согласия принимаются по отдельности намеренно: это два разных документа
 * с разными последствиями, и одна галочка «со всем согласен» скрывает, что
 * их два.
 */
export function ConsentStep({
  busy,
  onBack,
  onAccept,
}: {
  busy?: boolean
  onBack: () => void
  onAccept: (consents: Consent[]) => void
}) {
  const [signed, setSigned] = useState<Record<string, boolean>>({})
  const [reading, setReading] = useState<ConsentKind | null>(null)
  const all = CONSENT_DOCS.every((d) => signed[d.kind])

  return (
    <div className="stack">
      <div className="muted">
        Чтобы начать работу с тренером, примите два документа. Их можно прочитать целиком —
        нажмите на название.
      </div>

      {CONSENTS_ARE_PLACEHOLDER && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <div className="strong">Черновик документов</div>
          <div className="mute-sm mt-1">
            Окончательные тексты ещё не переданы. До этого подписи считаются техническими и
            юридической силы не имеют.
          </div>
        </div>
      )}

      <div className="group">
        {CONSENT_DOCS.map((doc) => (
          <div className="group-row" key={doc.kind}>
            <button
              className={`check${signed[doc.kind] ? ' on' : ''}`}
              role="checkbox"
              aria-checked={!!signed[doc.kind]}
              aria-label={`Принимаю: ${doc.title}`}
              onClick={() => setSigned((prev) => ({ ...prev, [doc.kind]: !prev[doc.kind] }))}
            >
              {signed[doc.kind] && <IconCheck size={18} />}
            </button>
            <button
              className="grow"
              style={{ textAlign: 'left' }}
              onClick={() => setReading(doc.kind)}
            >
              <span className="title">{doc.title}</span>
              <span className="sub" style={{ display: 'block' }}>
                {doc.summary} · читать
              </span>
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn primary block"
        disabled={busy || !all}
        onClick={() => onAccept(currentConsents().map((c) => ({ ...c, signed_at: Date.now() })))}
      >
        {busy ? 'Подключаю…' : 'Принять и подключить тренера'}
      </button>

      <button className="btn ghost block" disabled={busy} onClick={onBack}>
        <IconBack size={16} /> Назад к коду
      </button>

      <Sheet
        open={reading != null}
        title={reading ? consentDoc(reading).title : ''}
        onClose={() => setReading(null)}
      >
        {reading && (
          <div className="stack">
            <div className="mute-sm">Редакция {consentDoc(reading).version}</div>
            {/* Текст документа — переносы строк значимы, поэтому сохраняем их. */}
            <div style={{ whiteSpace: 'pre-line' }}>{consentDoc(reading).body}</div>
            <button className="btn block" onClick={() => setReading(null)}>
              Закрыть
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
