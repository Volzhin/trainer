import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ConsentKind } from '../db/db'
import { deleteAttachment, setTrainerDoc, trainerDocs } from '../db/coach'
import { openAttachment } from '../lib/backend'
import { formatDate } from '../lib/calc'
import { IconPlus, IconTrash } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

const DOCS: { kind: ConsentKind; title: string; sub: string }[] = [
  {
    kind: 'offer',
    title: 'Оферта',
    sub: 'Условия, на которых вы работаете с клиентом',
  },
  {
    kind: 'personal_data',
    title: 'Согласие на обработку персональных данных',
    sub: 'Какие данные вы собираете и зачем',
  },
]

/**
 * Документы тренера.
 *
 * Свои у каждого: тренеры работают по разным договорам, и один текст на
 * всех подошёл бы не всем. Что не прикреплено — клиенту не показывается,
 * и подписывать он это не будет: галочка под пустотой ничего не значит.
 */
export function TrainerDocs() {
  const { toast, userId } = useApp()
  const [pending, setPending] = useState<ConsentKind | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const version = useLiveQuery(() => db.attachments.count(), [])
  const docs = useLiveQuery(() => trainerDocs(userId), [userId, version])

  const pick = (kind: ConsentKind) => {
    setPending(kind)
    fileRef.current?.click()
  }

  const upload = async (list: FileList | null) => {
    const file = Array.from(list ?? [])[0]
    if (!file || !pending) return
    try {
      await setTrainerDoc({ kind: pending, blob: file, fileName: file.name, trainerId: userId })
      haptics.success()
      toast(t('Документ прикреплён'))
    } finally {
      setPending(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const attached = (kind: ConsentKind) => (docs ?? []).find((d) => d.doc_kind === kind)

  return (
    <>
      <div className="section-title">{t('Документы')}</div>
      <div className="card">
        <div className="mute-sm mb-3">
          {t(
            'Клиент подписывает их при подключении. Не прикреплённое не показывается и не подписывается.',
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(e) => void upload(e.target.files)}
        />

        <div className="group">
          {DOCS.map((doc) => {
            const file = attached(doc.kind)
            return (
              <div className="group-row" key={doc.kind}>
                <span className="grow">
                  <span className="title">{t(doc.title)}</span>
                  <span className="sub">
                    {file ? `${t('прикреплён')} ${formatDate(file.created_at)}` : t(doc.sub)}
                  </span>
                </span>

                {file ? (
                  <>
                    {/* Открыть можно только уехавший на сервер: локальный
                        Blob живёт в этой вкладке, и ссылка на него ничего
                        не скажет тому, кто откроет её с телефона. */}
                    {file.remote_id && file.remote_file && (
                      <a
                        className="btn sm"
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          openAttachment(file.remote_id!, file.remote_file!)
                        }}
                      >
                        {t('Открыть')}
                      </a>
                    )}
                    <button
                      className="icon-btn"
                      aria-label={t('Удалить')}
                      onClick={() => deleteAttachment(file.id)}
                    >
                      <IconTrash size={16} />
                    </button>
                  </>
                ) : (
                  <button className="btn sm" onClick={() => pick(doc.kind)}>
                    <IconPlus size={14} /> {t('Прикрепить')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
