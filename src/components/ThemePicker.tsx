import { useEffect, useState } from 'react'
import { getThemePref, setThemePref, type ThemePref } from '../db/db'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

const OPTIONS: [ThemePref, string][] = [
  ['auto', 'Авто'],
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
]

/** Выбор темы. «Авто» следует системной настройке устройства. */
export function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>('auto')

  useEffect(() => {
    void getThemePref().then(setPref)
  }, [])

  const pick = async (next: ThemePref) => {
    haptics.selection()
    setPref(next)
    await setThemePref(next)
  }

  return (
    <div className="segmented">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          className={pref === value ? 'on' : ''}
          onClick={() => pick(value)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  )
}
