/**
 * Запись голосовых и видеокружков через MediaRecorder.
 *
 * Форматы контейнеров у браузеров разные: Chrome отдаёт webm, Safari — mp4,
 * поэтому тип подбирается из поддерживаемых, а не задаётся жёстко.
 */

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

function pickType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return candidates.find((t) => MediaRecorder.isTypeSupported(t))
}

export type RecordingResult = {
  blob: Blob
  duration: number
  /** Огибающая громкости — рисуем её вместо повторного разбора файла. */
  waveform?: number[]
}

export type Recording = {
  stream: MediaStream
  stop: () => Promise<RecordingResult>
  cancel: () => void
  /** Текущая громкость 0..1 — для индикации во время записи. */
  level: () => number
  elapsed: () => number
}

async function start(constraints: MediaStreamConstraints, mimeType?: string): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const startedAt = performance.now()

  // Анализатор нужен и для индикатора, и для огибающей голосового.
  const audio = new AudioContext()
  const analyser = audio.createAnalyser()
  analyser.fftSize = 256
  audio.createMediaStreamSource(stream).connect(analyser)
  const buffer = new Uint8Array(analyser.frequencyBinCount)
  const samples: number[] = []

  let current = 0
  const sampler = setInterval(() => {
    analyser.getByteTimeDomainData(buffer)
    let peak = 0
    for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128) / 128)
    current = peak
    samples.push(peak)
  }, 100)

  const cleanup = () => {
    clearInterval(sampler)
    stream.getTracks().forEach((t) => t.stop())
    void audio.close().catch(() => {})
  }

  recorder.start(200)

  return {
    stream,
    level: () => current,
    elapsed: () => (performance.now() - startedAt) / 1000,
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      cleanup()
    },
    stop: () =>
      new Promise<RecordingResult>((resolve) => {
        const duration = (performance.now() - startedAt) / 1000
        recorder.onstop = () => {
          cleanup()
          resolve({
            blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'application/octet-stream' }),
            duration: Math.max(0.2, Math.round(duration * 10) / 10),
            waveform: compress(samples, 48),
          })
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop?.(new Event('stop'))
      }),
  }
}

/** Сжимает поток замеров до фиксированного числа столбиков. */
function compress(values: number[], target: number): number[] {
  if (!values.length) return []
  const step = values.length / target
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    const from = Math.floor(i * step)
    const to = Math.max(from + 1, Math.floor((i + 1) * step))
    let peak = 0
    for (let j = from; j < to && j < values.length; j++) peak = Math.max(peak, values[j])
    out.push(Math.round(peak * 100) / 100)
  }
  return out
}

export function recordVoice(): Promise<Recording> {
  return start(
    { audio: { echoCancellation: true, noiseSuppression: true } },
    pickType(AUDIO_TYPES),
  )
}

/** Кружок: квадратное видео с фронтальной камеры, как видеосообщение. */
export function recordCircle(): Promise<Recording> {
  return start(
    {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
    },
    pickType(VIDEO_TYPES),
  )
}

export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}
