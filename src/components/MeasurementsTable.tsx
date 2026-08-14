import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyMetric } from '../db/db'
import { bodyFatFromGirths } from '../lib/anthropometry'
import { formatDate } from '../lib/calc'
import { t } from '../lib/i18n'

type RowKey = 'weight_kg' | 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm'

const ROWS: { key: RowKey; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Вес', unit: 'кг' },
  { key: 'chest_cm', label: 'Грудь', unit: 'см' },
  { key: 'waist_cm', label: 'Талия', unit: 'см' },
  { key: 'hip_cm', label: 'Таз', unit: 'см' },
  { key: 'thigh_cm', label: 'Бедро', unit: 'см' },
]

/**
 * Столбцом становится замер лентой, а не любая запись с весом: взвешиваются
 * почти каждый день, и три последних столбца оказались бы взвешиваниями без
 * единого обхвата — таблица обхватов, состоящая из прочерков.
 */
const GIRTHS: RowKey[] = ['chest_cm', 'waist_cm', 'hip_cm', 'thigh_cm']

const DAY = 86400_000
/** Сколько замеров показываем: старт и два последних. */
const RECENT = 2

/**
 * Таблица замеров: с чего начали и что за последние две недели.
 *
 * Именно эти точки и сравнивают. Всю историю в таблицу не уместить, да и
 * незачем: середина пути отвечает на вопрос «что было тогда», а не
 * «сдвинулось ли», — для этого рядом график.
 *
 * Шеи в строках нет намеренно: её меряют один раз на старте, и постоянная
 * величина, повторённая в каждом столбце, только мешает читать таблицу.
 * Живёт она в профиле — там же, где рост.
 */
export function MeasurementsTable({
  metrics,
  userId,
  rows: only,
  withStart = true,
  title = 'Таблица замеров',
}: {
  metrics: BodyMetric[]
  userId: string
  /** Ограничить набор строк. По умолчанию — все, что измеряли. */
  rows?: RowKey[]
  /** Показывать столбец «старт». Выключается там, где нужен только срез. */
  withStart?: boolean
  title?: string
}) {
  const profile = useLiveQuery(() => db.profile.get(userId), [userId])

  const columns = useMemo(() => {
    const withGirths = metrics.filter((m) => GIRTHS.some((k) => typeof m[k] === 'number'))
    const sorted = [...withGirths].sort((a, b) => a.logged_at - b.logged_at)
    if (!sorted.length) return []

    const since = Date.now() - 14 * DAY
    const start = sorted[0]
    const recent = sorted
      .filter((m) => m.logged_at >= since && m.id !== start.id)
      .slice(-RECENT)

    if (!withStart) return recent.map((metric) => ({ metric, start: false }))
    // Стартовый замер не дублируем: если он же и последний, значит человек
    // только начал, и колонка «старт» — та же самая.
    return [{ metric: start, start: true }, ...recent.map((metric) => ({ metric, start: false }))]
  }, [metrics, withStart])

  const rows = useMemo(() => {
    const base = only ? ROWS.filter((r) => only.includes(r.key)) : ROWS
    // Показатель, которого никто не мерил, в таблицу не попадает: строка
    // «грудь: — — —» читается как потерянные данные, хотя означает обратное.
    return base.filter((r) => columns.some((c) => typeof c.metric[r.key] === 'number'))
  }, [columns, only])

  /**
   * Процент жира считаем по обхватам этого столбца, а не берём готовое поле:
   * там может лежать значение из биоимпеданса, и в таблице обхватов оно
   * выглядело бы как её собственный результат. Здесь всё расчётное — о чём
   * и говорит подпись.
   *
   * Шею берём из профиля, но у старых замеров она записана в самой строке —
   * их и считаем по ней, иначе история, снятая до переноса шеи в профиль,
   * осталась бы без процента жира.
   */
  const fatFor = (m: BodyMetric) => {
    const v = bodyFatFromGirths(
      { neck: profile?.neck_cm ?? m.neck_cm, waist: m.waist_cm, hip: m.hip_cm },
      profile?.height_cm ?? 0,
      profile?.gender ?? 'м',
    )
    return v == null ? undefined : Math.round(v * 10) / 10
  }

  if (!columns.length || !rows.length) return null

  const showFat = columns.some((c) => fatFor(c.metric) != null)

  return (
    <>
      <div className="section-title">{t(title)}</div>
      <div className="card" style={{ padding: 0 }}>
        {/* Прокручивается сама таблица, а не страница: первый столбец должен
            оставаться на виду — иначе непонятно, чья это строка. */}
        <div className="measure-scroll">
          <table className="measure-table">
            <thead>
              <tr>
                <th />
                {columns.map((c) => (
                  <th key={c.metric.id}>
                    <div className="cap">{c.start ? t('старт') : formatDate(c.metric.logged_at)}</div>
                    {c.start && <div className="mute-sm">{formatDate(c.metric.logged_at)}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {t(r.label)}
                    <span className="mute-sm">, {t(r.unit)}</span>
                  </th>
                  {columns.map((c) => {
                    const v = c.metric[r.key]
                    return (
                      <td key={c.metric.id} className="figures">
                        {typeof v === 'number' ? v : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            {showFat && (
              <tfoot>
                <tr>
                  <th scope="row">
                    {t('Жир расчётный')}
                    <span className="mute-sm">, %</span>
                  </th>
                  {columns.map((c) => {
                    const fat = fatFor(c.metric)
                    return (
                      <td key={c.metric.id} className="figures">
                        {fat != null ? fat : '—'}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {showFat && (
        <div className="mute-sm mt-2">
          {t('Процент жира посчитан по обхватам — это оценка, а не замер. Диаграмму InBody она не меняет.')}
        </div>
      )}
      {withStart && columns.length === 1 && (
        <div className="mute-sm mt-2">
          {t('За две недели новых замеров нет — сравнивать пока не с чем.')}
        </div>
      )}
    </>
  )
}
