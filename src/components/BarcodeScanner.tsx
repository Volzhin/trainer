import { useEffect, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { haptics } from '../lib/native'

/**
 * Сканер штрихкодов камерой.
 *
 * Распознавание идёт встроенным в браузер BarcodeDetector — без сторонних
 * библиотек и без отправки кадров куда-либо. Поддержка есть не везде
 * (в Safari её нет), поэтому у сканера всегда остаётся запасной путь —
 * ввод кода руками, иначе функция упрётся в браузер пользователя.
 */

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type DetectorCtor = new (opts?: { formats?: string[] }) => Detector

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

export function scannerSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const [error, setError] = useState<string>()
  const [manual, setManual] = useState('')

  // Обработчик находки держим в ссылке: он приходит стрелкой из разметки
  // родителя, а камеру нельзя перезапускать на каждую его перерисовку —
  // getUserMedia гасил бы поток и просил доступ заново посреди сканирования.
  const detectedRef = useRef(onDetected)
  useEffect(() => {
    detectedRef.current = onDetected
  })

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const start = async () => {
      if (!scannerSupported()) {
        setError('Браузер не умеет распознавать штрихкоды — введите код вручную')
        return
      }
      try {
        // Задняя камера: штрихкод сканируют с обратной стороны устройства.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
        const detector = new Ctor({ formats: FORMATS })

        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const found = await detector.detect(videoRef.current)
            const code = found[0]?.rawValue
            if (code) {
              haptics.success()
              cancelled = true
              detectedRef.current(code)
              return
            }
          } catch {
            /* кадр не распознан — просто пробуем следующий */
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch {
        setError('Нет доступа к камере — введите код вручную')
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open])

  return (
    <Sheet open={open} title="Штрихкод" onClose={onClose}>
      <div className="stack">
        {!error && (
          <div className="scanner">
            <video ref={videoRef} muted playsInline />
            <div className="scanner-frame" />
          </div>
        )}

        <div className="mute-sm" style={{ textAlign: 'center' }}>
          {error ?? 'Наведите камеру на штрихкод — распознается сам'}
        </div>

        <div className="field">
          <label>Или введите цифры под кодом</label>
          <input
            className="input"
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
            placeholder="4600000000000"
            style={{ fontFamily: 'var(--font-num)', letterSpacing: 1 }}
          />
        </div>

        <button
          className="btn primary block"
          disabled={manual.length < 8}
          onClick={() => onDetected(manual)}
        >
          Найти продукт
        </button>
      </div>
    </Sheet>
  )
}
