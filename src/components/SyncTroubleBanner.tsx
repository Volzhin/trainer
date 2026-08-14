import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { onSyncTrouble, type SyncTrouble } from '../db/sync'
import { t } from '../lib/i18n'

/**
 * Полоса «данные не уходят».
 *
 * Обмен идёт в фоне и до сих пор молчал о своих бедах. Когда сервер перестал
 * принимать записи, у людей час не уходили ни сообщения, ни назначения — и ни
 * на одном экране не было об этом ни слова: написанное ложится в местную базу,
 * а она отвечает мгновенно и в любом состоянии сети. Поломку заметили не по
 * приложению, а по тому, что человек на другом конце не дождался ответа.
 *
 * Полоса живёт в общем потоке, а не поверх содержимого: перекрывать заголовок
 * экрана ради предупреждения — значит менять одну потерю на другую.
 *
 * Про отсутствие сети она молчит: приложение офлайн-первое, работа без связи
 * здесь норма, а не беда.
 */
export function SyncTroubleBanner() {
  const [trouble, setTrouble] = useState<SyncTrouble>(null)
  useEffect(() => onSyncTrouble(setTrouble), [])

  const owners = trouble?.kind === 'stranger' ? trouble.owners : []
  const names = useLiveQuery(
    async () => {
      if (!owners.length) return ''
      const people = await db.profile.bulkGet(owners)
      return people
        .map((p, i) => p?.name?.trim() || owners[i].slice(0, 8))
        .join(', ')
    },
    [owners.join(',')],
    '',
  )

  if (!trouble) return null

  return (
    <div className="sync-trouble">
      <div className="strong">
        {trouble.kind === 'rejected'
          ? t('Данные не уходят на сервер')
          : t('Данные для клиента не уходят')}
      </div>
      <div className="mute-sm mt-1">
        {trouble.kind === 'rejected' ? (
          t('Сервер не принимает изменения. Написанное сохранено и уедет, как только он снова начнёт их принимать, — ничего не пропадёт.')
        ) : (
          <>
            {t('Сервер не считает этого человека вашим клиентом — проверьте связь в его карточке. Сообщения и назначения сохранены и уедут, когда связь восстановится.')}
            {names ? <div className="mt-1">{names}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}
