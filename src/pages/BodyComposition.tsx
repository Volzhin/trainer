import { useNavigate } from 'react-router-dom'
import { BodyCompositionView } from '../components/BodyCompositionView'
import { IconBack } from '../components/Icons'
import { useApp } from '../store/app'

/** Экран клиента: свой состав тела. Разбор общий с карточкой клиента у тренера. */
export function BodyComposition() {
  const nav = useNavigate()
  const { userId } = useApp()

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">Анализ тела</h1>
          <div className="sub">Отчёты InBody и динамика</div>
        </div>
      </div>

      <BodyCompositionView userId={userId} />
    </div>
  )
}
