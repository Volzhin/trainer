import { haptics } from '../lib/native'

/**
 * Переключатель настройки.
 *
 * Без подписи внутри: её ставит строка списка (`Row`), у которой заголовок и
 * пояснение уже размечены. Раньше компонент умел рисовать подпись сам и
 * прятал её пустым div-ом, когда её не передали, — два способа подписать
 * одно и то же расходились при каждой правке.
 */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  /** Только для доступности: видимую подпись рисует строка вокруг. */
  label?: string
}) {
  return (
    <button
      className={`toggle${value ? ' on' : ''}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => {
        haptics.selection()
        onChange(!value)
      }}
    >
      <span className="toggle-knob" />
    </button>
  )
}
