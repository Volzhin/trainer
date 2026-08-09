import { useTrainerLink } from '../store/app'

/**
 * Отчёты клиента тренеру.
 *
 * Экран действий: сдать вес, замеры, InBody, шаги и сон. Сами формы
 * подключаются на этапе «Клиент: питание и отчёты».
 *
 * Клиент видит только два состояния отчёта — не сдан и сдан. Стадия
 * проверки тренером сюда не доходит и доходить не должна: человек не
 * должен гадать, почему его отчёт «ещё смотрят».
 */
export function Reports() {
  const bond = useTrainerLink()

  if (bond === undefined) {
    return (
      <div className="screen">
        <div className="empty">Загрузка…</div>
      </div>
    )
  }

  if (!bond) {
    return (
      <div className="screen">
        <div className="header">
          <h1>Отчёты</h1>
        </div>
        <div className="empty">Отчёты сдаются тренеру. Код приглашения вводится в профиле.</div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Отчёты</h1>
          <div className="sub">Тренер: {bond.trainer.name}</div>
        </div>
      </div>

      <div className="empty">Формы отчётов появятся здесь на следующем этапе</div>
    </div>
  )
}
