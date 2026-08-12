import { useMemo } from 'react'
import type { BodyMetric } from '../db/db'
import { formatDate } from '../lib/calc'
import { t } from '../lib/i18n'

/** Что показываем строками. Порядок — от общего к частному. */
const ROWS: { key: keyof BodyMetric; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Вес', unit: 'кг' },
  { key: 'body_fat_pct', label: 'Жир', unit: '%' },
  { key: 'skeletal_muscle_kg', label: 'Мышцы', unit: 'кг' },
  { key: 'waist_cm', label: 'Талия', unit: 'см' },
  { key: 'chest_cm', label: 'Грудь', unit: 'см' },
  { key: 'hip_cm', label: 'Таз', unit: 'см' },
  { key: 'neck_cm', label: 'Шея', unit: 'см' },
  { key: 'thigh_cm', label: 'Бедро', unit: 'см' },
]

const DAY = 86400_000

/**
 * Таблица замеров: с чего начали и что за последние две недели.
 *
 * Именно эти две точки и сравнивают. Вся история целиком в таблицу не
 * помещается и не нужна: середина пути отвечает на вопрос «что было
 * тогда», а не «сдвинулось ли», — для неё есть график.
 *
 * Строки — только те показатели, которые действительно измеряли. Пустая
 * строка «мышцы: — — —» выглядит как потерянные данные, хотя означает, что
 * их никто и не мерил.
 */
export function MeasurementsTable({ metrics }: { metrics: BodyMetric[] }) {
  const columns = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => a.logged_at - b.logged_at)
    if (!sorted.length) return []

    const since = Date.now() - 14 * DAY
    const recent = sorted.filter((m) => m.logged_at >= since)
    const start = sorted[0]

    // Стартовый замер не дублируем: если он и есть в последних двух
    // неделях, значит человек только начал, и колонка «старт» — та же.
    const rest = recent.filter((m) => m.id !== start.id)
    return [{ metric: start, start: true }, ...rest.map((m) => ({ metric: m, start: false }))]
  }, [metrics])

  const rows = useMemo(
    () => ROWS.filter((r) => columns.some((c) => typeof c.metric[r.key] === 'number')),
    [columns],
  )

  if (!columns.length || !rows.length) return null

  const value = (m: BodyMetric, key: keyof BodyMetric) => {
    const v = m[key]
    return typeof v === 'number' ? String(v) : '—'
  }

  return (
    <>
      <div className="section-title">{t('Таблица замеров')}</div>
      <div className="card" style={{ padding: 0 }}>
        {/* Прокручивается сама таблица, а не страница: колонок бывает
            больше, чем влезает в телефон, а первый столбец должен
            оставаться на виду — иначе непонятно, чья это строка. */}
        <div className="measure-scroll">
          <table className="measure-table">
            <thead>
              <tr>
                <th />
                {columns.map((c) => (
                  <th key={c.metric.id}>
                    <div className="cap">{c.start ? t('старт') : formatDate(c.metric.logged_at)}</div>
                    {c.start && (
                      <div className="mute-sm">{formatDate(c.metric.logged_at)}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.key)}>
                  <th scope="row">
                    {t(r.label)}
                    <span className="mute-sm">, {r.unit}</span>
                  </th>
                  {columns.map((c) => (
                    <td key={c.metric.id} className="figures">
                      {value(c.metric, r.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {columns.length === 1 && (
        <div className="mute-sm mt-2">
          {t('За две недели новых замеров нет — сравнивать пока не с чем.')}
        </div>
      )}
    </>
  )
}
