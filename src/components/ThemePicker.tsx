import { useEffect, useState } from 'react'
import {
  getAccentPref,
  getThemePref,
  setAccentPref,
  setThemePref,
  type AccentPref,
  type ThemePref,
} from '../db/db'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

const ACCENTS: [AccentPref, string][] = [
  ['lime', 'Лаймовый'],
  ['indigo', 'Сине-фиолетовый'],
]

const OPTIONS: [ThemePref, string][] = [
  ['auto', 'Авто'],
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
]

/** Выбор темы. «Авто» следует системной настройке устройства. */
export function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>('auto')
  const [accent, setAccent] = useState<AccentPref>('lime')

  useEffect(() => {
    void getThemePref().then(setPref)
    void getAccentPref().then(setAccent)
  }, [])

  const pick = async (next: ThemePref) => {
    haptics.selection()
    setPref(next)
    await setThemePref(next)
  }

  const pickAccent = async (next: AccentPref) => {
    haptics.selection()
    setAccent(next)
    await setAccentPref(next)
  }

  return (
    <>
      <div className="segmented">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            className={pref === value ? 'on' : ''}
            onClick={() => pick(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mute-sm" style={{ margin: '12px 0 8px' }}>
        {t('Акцент')}
      </div>
      <div className="segmented">
        {ACCENTS.map(([value, label]) => (
          <button
            key={value}
            className={accent === value ? 'on' : ''}
            onClick={() => pickAccent(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
