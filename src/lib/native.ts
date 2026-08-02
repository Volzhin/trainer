/**
 * Абстракция над нативными возможностями устройства.
 * В вебе используется Vibration API / Notification API,
 * при сборке через Capacitor эти вызовы заменяются на
 * @capacitor/haptics и @capacitor/local-notifications без правок UI.
 */

let hapticsEnabled = true
let soundEnabled = true

export function configureNative(opts: { haptics?: boolean; sound?: boolean }) {
  if (opts.haptics !== undefined) hapticsEnabled = opts.haptics
  if (opts.sound !== undefined) soundEnabled = opts.sound
}

function vibrate(pattern: number | number[]) {
  if (!hapticsEnabled) return
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* устройство без вибромотора */
    }
  }
}

export const haptics = {
  /** Лёгкий отклик: прокрутка степперов, выбор значения. */
  selection: () => vibrate(8),
  /** Средний: подтверждение подхода. */
  impact: () => vibrate(18),
  /** Успех: тренировка завершена, личный рекорд. */
  success: () => vibrate([14, 60, 26]),
  /** Предупреждение: конец отдыха. */
  warning: () => vibrate([30, 80, 30, 80, 60]),
}

/** Короткий сигнал окончания отдыха через WebAudio (без файлов-ассетов). */
export function beep(times = 2) {
  if (!soundEnabled) return
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      const at = ctx.currentTime + i * 0.28
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.24)
    }
    setTimeout(() => ctx.close(), times * 300 + 300)
  } catch {
    /* автоплей заблокирован до первого жеста пользователя */
  }
}

/**
 * Локальное уведомление об окончании отдыха.
 * Разрешение запрашивается в контексте использования — при первом запуске
 * таймера, а не на старте приложения (требование гайдлайнов Apple).
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const res = await Notification.requestPermission()
  return res === 'granted'
}

export function notifyRestOver(nextLabel?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification('Отдых окончен', {
      body: nextLabel ? `Следующий подход: ${nextLabel}` : 'Пора к следующему подходу',
      tag: 'rest-timer',
      silent: false,
    })
  } catch {
    /* iOS Safari вне standalone-режима уведомления не поддерживает */
  }
}

/** Признак запуска в виде установленного приложения (PWA / Capacitor). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}
