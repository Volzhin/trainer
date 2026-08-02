import { ProgressView } from '../components/ProgressView'
import { useApp } from '../store/app'

/** Свой прогресс. Разбор общий с тренерским — см. ProgressView. */
export function Progress() {
  const { userId } = useApp()
  return (
    <div className="screen">
      <ProgressView userId={userId} />
    </div>
  )
}
