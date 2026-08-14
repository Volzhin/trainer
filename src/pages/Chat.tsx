import { ChatThread } from '../components/ChatThread'
import { useApp, useTrainerLink } from '../store/app'
import { t } from '../lib/i18n'

/**
 * Переписка с тренером.
 *
 * Раздел появляется вместе с тренером и исчезает вместе с ним — писать
 * в пустоту приложение не предлагает.
 */
export function Chat() {
  const { userId } = useApp()
  const bond = useTrainerLink()

  if (bond === undefined) {
    return (
      <div className="screen">
        <div className="empty">{t('Загрузка…')}</div>
      </div>
    )
  }

  // Сюда можно попасть по прямой ссылке, оставшейся с тех пор, когда тренер
  // был. Пустой экран честнее переброса: человек видит, почему тут пусто.
  if (!bond) {
    return (
      <div className="screen">
        <div className="header">
          <h1>{t('Чат')}</h1>
        </div>
        <div className="empty">
          {t(
            'Чат появится, когда вы начнёте работать с тренером. Код приглашения вводится в профиле.',
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Чат')}</h1>
          <div className="sub">{bond.trainer.name}</div>
        </div>
      </div>

      <ChatThread
        trainerId={bond.trainer.id}
        clientId={userId}
        meId={userId}
        meRole="CLIENT"
        emptyHint="Напишите тренеру — он увидит сообщение у себя в карточке."
      />
    </div>
  )
}
