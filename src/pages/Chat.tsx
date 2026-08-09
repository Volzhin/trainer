import { IconChat } from '../components/Icons'
import { useTrainerLink } from '../store/app'

/**
 * Переписка с тренером.
 *
 * Раздел появляется вместе с тренером и исчезает вместе с ним — писать
 * в пустоту приложение не предлагает. Сама переписка собирается на этапе
 * «Чат»; сообщения для неё уже описаны в базе (таблица chat).
 */
export function Chat() {
  const bond = useTrainerLink()

  if (bond === undefined) {
    return (
      <div className="screen">
        <div className="empty">Загрузка…</div>
      </div>
    )
  }

  // Сюда можно попасть по прямой ссылке, оставшейся с тех пор, когда тренер
  // был. Пустой экран честнее переброса: человек видит, почему тут пусто.
  if (!bond) {
    return (
      <div className="screen">
        <div className="header">
          <h1>Чат</h1>
        </div>
        <div className="empty">
          Чат появится, когда вы начнёте работать с тренером. Код приглашения вводится в
          профиле.
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Чат</h1>
          <div className="sub">{bond.trainer.name}</div>
        </div>
      </div>

      <div className="empty">
        <IconChat size={22} />
        <div style={{ marginTop: 8 }}>Сообщений пока нет</div>
      </div>
    </div>
  )
}
