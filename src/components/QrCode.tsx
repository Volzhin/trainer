import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/**
 * QR-код приглашения.
 *
 * Рисуем SVG, а не canvas: код остаётся чётким на любой плотности экрана и
 * при печати, а на телефоне его читают именно с чужого экрана — размытые
 * края там дороже лишних килобайт разметки.
 *
 * Уровень коррекции M, а не L: код показывают с экрана, который бликует, и
 * запас на нечитаемые модули тут не роскошь. Данных мало (короткая ссылка),
 * поэтому сетка всё равно остаётся мелкой.
 */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()

    const n = qr.getModuleCount()
    // Один путь на все тёмные модули вместо тысячи прямоугольников: так
    // разметка остаётся лёгкой, а браузер не считает каждый элемент.
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
      }
    }
    return { path: d, count: n }
  }, [value])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      role="img"
      aria-label={value}
      /* Тихая зона обязательна по стандарту — без неё сканер не находит
         границы кода. Она же белая: инвертированный QR читают не все. */
      style={{ background: '#fff', borderRadius: 8, display: 'block' }}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="#000" />
    </svg>
  )
}
