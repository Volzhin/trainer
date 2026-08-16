import { useState } from 'react'
import type { Consent } from '../db/db'
import { openAttachment, type TrainerDoc } from '../lib/backend'
import { IconBack, IconCheck } from './Icons'
import { t } from '../lib/i18n'

/**
 * Подписание документов тренера.
 *
 * Документы у каждого тренера свои — общего текста нет: работают по разным
 * договорам, и один на всех подошёл бы не всем. Чего тренер не прикрепил,
 * того клиент не увидит и подписывать не будет: галочка под пустотой
 * ничего не значит, а согласие с несуществующим документом — тем более.
 *
 * Принимаются по отдельности: это разные документы с разными
 * последствиями, и одна галочка «со всем согласен» скрывает, что их два.
 */

const TITLES: Record<string, string> = {
  offer: 'Оферта',
  personal_data: 'Согласие на обработку персональных данных',
}

export function ConsentStep({
  documents,
  busy,
  onBack,
  onAccept,
}: {
  documents: TrainerDoc[]
  busy?: boolean
  onBack: () => void
  onAccept: (consents: Consent[]) => void
}) {
  const [signed, setSigned] = useState<Record<string, boolean>>({})
  const all = documents.every((d) => signed[d.kind])

  const accept = () =>
    onAccept(
      documents.map((d) => ({
        kind: d.kind as Consent['kind'],
        // Версия — идентификатор файла: тренер заменил документ, значит
        // подписан другой, и прежняя подпись к нему не относится.
        version: d.id,
        signed_at: Date.now(),
      })),
    )

  return (
    <div className="stack">
      <div className="muted">
        {documents.length
          ? t(
              'Чтобы начать работу с тренером, примите его документы. Нажмите на название, чтобы открыть.',
            )
          : t(
              'У этого тренера нет прикреплённых документов, поэтому вы ничего не подписываете. Если ждали оферту или согласие на обработку данных — попросите его их приложить.',
            )}
      </div>

      <div className="group">
        {documents.map((doc) => (
          <div className="group-row" key={doc.kind}>
            <button
              className={`check${signed[doc.kind] ? ' on' : ''}`}
              role="checkbox"
              aria-checked={!!signed[doc.kind]}
              aria-label={`${t('Принимаю')}: ${t(TITLES[doc.kind] ?? doc.kind)}`}
              onClick={() => setSigned((prev) => ({ ...prev, [doc.kind]: !prev[doc.kind] }))}
            >
              {signed[doc.kind] && <IconCheck size={18} />}
            </button>
            <a
              className="grow"
              style={{ textAlign: 'left' }}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                openAttachment(doc.id, doc.file)
              }}
            >
              <span className="title">{t(TITLES[doc.kind] ?? doc.kind)}</span>
              <span className="sub">{t('открыть документ')}</span>
            </a>
          </div>
        ))}
      </div>

      <button className="btn primary block" disabled={busy || !all} onClick={accept}>
        {busy
          ? t('Подключаю…')
          : documents.length
            ? t('Принять и подключить тренера')
            : t('Подключить тренера')}
      </button>

      <button className="btn ghost block" disabled={busy} onClick={onBack}>
        <IconBack size={16} /> {t('Назад к коду')}
      </button>
    </div>
  )
}
