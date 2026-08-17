import { useEffect, useState } from 'react'
import type { Attachment } from '../db/db'
import { POSE_KEYS, daysBetween, photoBlob, seriesLabel, type PhotoSeries } from '../db/photos'
import { POSES } from './TaskPhotos'
import { plural } from '../lib/calc'
import { t } from '../lib/i18n'

/**
 * Blob из IndexedDB → временный URL, который освобождаем при размонтировании.
 * Тот же хук, что у видео техники (`ExerciseVideo.tsx`): написанный прямо в
 * разметке `createObjectURL` выдаёт новый адрес на каждую перерисовку и
 * держит файл в памяти до перезагрузки вкладки.
 */
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/* Размеры холста. В пикселях картинки, а не экрана: коллаж уходит из
   приложения — в галерею, в переписку — и должен читаться там, где никаких
   наших стилей уже нет. */
const PAD = 28
const GAP = 14
const CELL_W = 300
const CELL_H = 400
const HEAD_H = 96
const ROW_CAP = 32
const POSE_CAP = 36

/* Гарнитура интерфейса. canvas не понимает переменных, поэтому имя пишется
   здесь — но оно то же самое, что в --font-ui, и запасные тоже. */
const FONT = 'Manrope, system-ui, sans-serif'

/** Цвет из токенов: коллаж рисуется теми же значениями, что и экраны. */
const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'

/** Кадрирование «по короткой стороне» — тот же object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Картинка снимка, готовая к отрисовке. null — файла нет или он не доехал. */
async function loadShot(shot?: Attachment): Promise<ImageBitmap | null> {
  if (!shot) return null
  const blob = await photoBlob(shot)
  if (!blob) return null
  try {
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

async function paint(before: PhotoSeries, after: PhotoSeries): Promise<Blob | null> {
  // Ракурс попадает в коллаж, если он есть хотя бы на одной стороне: пустая
  // клетка «нет кадра» честнее, чем молча выпавший бок.
  const poses = POSE_KEYS.filter(
    (p) => before.shots.some((s) => s.pose === p) || after.shots.some((s) => s.pose === p),
  )
  if (!poses.length) return null

  // Текст на холст ложится один раз и «когда шрифт догрузится» не
  // переставляется: не дождавшись Manrope, коллаж уходит в галерею набранным
  // системным шрифтом — и это видно.
  await document.fonts?.ready

  const pairs = await Promise.all(
    poses.map(async (pose) => ({
      pose,
      a: await loadShot(before.shots.find((s) => s.pose === pose)),
      b: await loadShot(after.shots.find((s) => s.pose === pose)),
    })),
  )

  const n = poses.length
  const canvas = document.createElement('canvas')
  canvas.width = PAD * 2 + n * CELL_W + (n - 1) * GAP
  canvas.height = PAD * 2 + HEAD_H + (ROW_CAP + CELL_H) * 2 + GAP + POSE_CAP
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const bg = token('--bg')
  const surface = token('--surface-2')
  const text = token('--text')
  const text2 = token('--text-2')
  const text3 = token('--text-3')
  const accent = token('--accent-ink')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const days = daysBetween(before.date, after.date)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = text
  ctx.font = `800 30px ${FONT}`
  ctx.fillText(t('Прогресс в фото'), PAD, PAD + 30)
  ctx.fillStyle = text2
  ctx.font = `500 19px ${FONT}`
  ctx.fillText(
    `${seriesLabel(before.date)} → ${seriesLabel(after.date)} · ${days} ${plural(days, [
      'день',
      'дня',
      'дней',
    ])}`,
    PAD,
    PAD + 66,
  )

  const rowY = [PAD + HEAD_H, PAD + HEAD_H + ROW_CAP + CELL_H + GAP]
  const caption = [
    `${t('Было')} · ${seriesLabel(before.date)}`,
    `${t('Стало')} · ${seriesLabel(after.date)}`,
  ]

  for (let r = 0; r < 2; r++) {
    ctx.fillStyle = r === 0 ? text2 : accent
    ctx.font = `700 18px ${FONT}`
    ctx.fillText(caption[r], PAD, rowY[r] + 20)

    pairs.forEach((pair, i) => {
      const x = PAD + i * (CELL_W + GAP)
      const y = rowY[r] + ROW_CAP
      const img = r === 0 ? pair.a : pair.b
      ctx.fillStyle = surface
      ctx.fillRect(x, y, CELL_W, CELL_H)
      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, CELL_W, CELL_H)
        ctx.clip()
        drawCover(ctx, img, x, y, CELL_W, CELL_H)
        ctx.restore()
      } else {
        ctx.fillStyle = text3
        ctx.font = `500 17px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(t('Кадра нет'), x + CELL_W / 2, y + CELL_H / 2)
        ctx.textAlign = 'left'
      }
    })
  }

  ctx.fillStyle = text2
  ctx.font = `600 17px ${FONT}`
  ctx.textAlign = 'center'
  pairs.forEach((pair, i) => {
    const label = POSES.find((p) => p.key === pair.pose)?.label ?? ''
    ctx.fillText(
      t(label),
      PAD + i * (CELL_W + GAP) + CELL_W / 2,
      rowY[1] + ROW_CAP + CELL_H + 26,
    )
  })
  ctx.textAlign = 'left'

  for (const pair of pairs) {
    pair.a?.close()
    pair.b?.close()
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
}

/**
 * Коллаж «было / стало».
 *
 * Собирается сам при открытии сравнения, а не по кнопке «построить»: кнопка
 * заставляла бы человека догадаться, что за ней вообще что-то есть, — ради
 * картинки, которую он и так пришёл посмотреть.
 *
 * Рисуем штатным canvas: экран открывается офлайн и на слабом телефоне, и
 * библиотека ради склейки шести картинок здесь была бы дороже самой задачи.
 */
export function PhotoCollage({
  before,
  after,
  onSend,
  sendLabel,
}: {
  before: PhotoSeries
  after: PhotoSeries
  /** Отправка тренеру — только у клиента, поэтому приходит снаружи. */
  onSend?: () => void | Promise<void>
  sendLabel?: string
}) {
  const [blob, setBlob] = useState<Blob>()
  const [busy, setBusy] = useState(true)
  const url = useBlobUrl(blob)

  const key = `${before.date}|${after.date}|${[...before.shots, ...after.shots]
    .map((s) => s.id)
    .join(',')}`

  useEffect(() => {
    let alive = true
    setBusy(true)
    void paint(before, after).then((b) => {
      if (!alive) return
      setBlob(b ?? undefined)
      setBusy(false)
    })
    return () => {
      alive = false
    }
    // Пересобираем по составу серий, а не по ссылкам: useLiveQuery отдаёт
    // новые объекты на каждое изменение базы, в том числе не касающееся фото,
    // и коллаж перерисовывался бы на каждый чих.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `progress-${before.date}_${after.date}.jpg`
    a.click()
  }

  if (busy) return <div className="card skeleton collage-skeleton" />
  if (!url) return <div className="empty compact">{t('Коллаж не собрался — нет ни одного кадра.')}</div>

  return (
    <>
      <img className="collage-img" src={url} alt={t('Прогресс в фото')} />
      <div className="row mt-2">
        <button className="btn grow" onClick={save}>
          {t('Сохранить картинку')}
        </button>
        {onSend && (
          <button className="btn primary grow" onClick={() => void onSend()}>
            {sendLabel ?? t('Написать тренеру')}
          </button>
        )}
      </div>
    </>
  )
}
