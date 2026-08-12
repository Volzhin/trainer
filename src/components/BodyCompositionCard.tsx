import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BodyMetric } from '../db/db'
import { listBodyMetrics } from '../db/repo'
import { formatDate } from '../lib/calc'
import { BODY_C } from './BodyCompositionView'
import { t } from '../lib/i18n'

/**
 * Компактная сводка состава тела: полоска долей + три ключевых числа
 * с дельтой к прошлому замеру. Ведёт на полный разбор.
 */

type Part = { key: string; value: number; color: string }

const round1 = (v: number) => Math.round(v * 10) / 10

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function BodyCompositionCard({
  userId,
  onOpen,
  subject = 'self',
}: {
  userId: string
  onOpen: () => void
  subject?: 'self' | 'client'
}) {
  const metrics = useLiveQuery(() => listBodyMetrics(userId), [userId], [] as BodyMetric[])

  const { latest, previous, lastWeight, inbody, inbodyPrev } = useMemo(() => {
    const all = metrics ?? []
    // Ручной замер такой же полноценный, как импортированный отчёт.
    const scans = all
      .filter((m) => m.weight_kg != null || m.body_fat_pct != null)
      .sort((a, b) => b.logged_at - a.logged_at)
    const weighed = all
      .filter((m) => m.weight_kg != null)
      .sort((a, b) => b.logged_at - a.logged_at)
    /**
     * Полосу состава и мышцы рисуем только по биоимпедансу — и отбираем по
     * источнику, а не по наличию полей: ручные замеры, сделанные до того как
     * приложение перестало досчитывать мышцы и воду, до сих пор лежат в базе
     * с этими числами и по полям неотличимы от отчёта InBody.
     */
    const bio = scans.filter((m) => m.source === 'inbody')
    return {
      latest: scans[0],
      previous: scans[1],
      lastWeight: weighed[0],
      inbody: bio[0],
      inbodyPrev: bio[1],
    }
  }, [metrics])

  if (!latest) {
    return (
      <button
        className="card tap"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={onOpen}
      >
        <div className="row between">
          <div className="grow">
            <div className="strong">{t('Анализ тела')}</div>
            <div className="mute-sm" style={{ marginTop: 3 }}>
              {subject === 'client'
                ? 'Замеров InBody нет — можно загрузить отчёт клиента'
                : 'Загрузите отчёт InBody — разберём мышцы, жир, воду и нормы'}
            </div>
            {lastWeight?.weight_kg != null && (
              <div className="mute-sm mt-2">
                Последний вес: {lastWeight.weight_kg} кг · {formatDate(lastWeight.logged_at)}
              </div>
            )}
          </div>
          <span className="chevron">
            <Chevron />
          </span>
        </div>
      </button>
    )
  }

  const parts: Part[] = (
    (inbody
      ? [
          { key: 'muscle', value: inbody.skeletal_muscle_kg, color: BODY_C.muscle },
          { key: 'protein', value: inbody.protein_kg, color: BODY_C.protein },
          { key: 'minerals', value: inbody.minerals_kg, color: BODY_C.minerals },
          { key: 'water', value: inbody.body_water_l, color: BODY_C.water },
          { key: 'fat', value: inbody.body_fat_kg, color: BODY_C.fat },
        ]
      : []) as { key: string; value?: number; color: string }[]
  ).filter((p): p is Part => typeof p.value === 'number' && p.value > 0)

  /*
   * Полосу состава рисуем только когда долей больше одной.
   *
   * Без биоимпеданса известна ровно одна — жировая масса, посчитанная от
   * процента жира. Одна доля заполняет полосу целиком и читается как
   * «сто процентов жира», хотя означает всего лишь, что остального никто
   * не измерял.
   */
  const total = parts.length > 1 ? parts.reduce((a, p) => a + p.value, 0) : 0

  return (
    <button className="card tap" style={{ width: '100%', textAlign: 'left' }} onClick={onOpen}>
      <div className="row between">
        <div className="grow">
          <div className="strong">{t('Анализ тела')}</div>
          <div className="mute-sm" style={{ marginTop: 1 }}>
            Замер от {formatDate(latest.logged_at)}
          </div>
        </div>
        <span className="chevron">
          <Chevron />
        </span>
      </div>

      {total > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 3,
            height: 8,
            marginTop: 12,
            borderRadius: 4,
            overflow: 'hidden',
          }}
          aria-hidden
        >
          {parts.map((p) => (
            <i
              key={p.key}
              style={{
                width: `${(p.value / total) * 100}%`,
                background: p.color,
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      )}

      <div className="metrics mt-3">
        <Stat
          label={t('Вес')}
          unit="кг"
          now={latest.weight_kg}
          was={previous?.weight_kg}
          better="down"
        />
        <Stat
          label={t('Жир')}
          unit="%"
          now={latest.body_fat_pct}
          was={previous?.body_fat_pct}
          better="down"
          color={BODY_C.fat}
        />
        <Stat
          label={t('Мышцы')}
          unit="кг"
          now={inbody?.skeletal_muscle_kg}
          was={inbodyPrev?.skeletal_muscle_kg}
          better="up"
          color={BODY_C.muscle}
        />
      </div>
    </button>
  )
}

function Stat({
  label,
  unit,
  now,
  was,
  better,
  color,
}: {
  label: string
  unit: string
  now?: number
  was?: number
  better: 'up' | 'down'
  color?: string
}) {
  const diff = now != null && was != null ? round1(now - was) : null
  const good = diff == null || diff === 0 ? null : better === 'up' ? diff > 0 : diff < 0

  return (
    <div className="metric">
      <div className="num" style={{ fontSize: 20, color }}>
        {now ?? '—'}
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}> {unit}</span>
      </div>
      <div className="cap">
        {label}
        {diff != null && diff !== 0 && (
          <span
            style={{
              marginLeft: 5,
              fontWeight: 600,
              color: good ? 'var(--ok)' : 'var(--danger)',
            }}
          >
            {diff > 0 ? '↑' : '↓'}
            {Math.abs(diff)}
          </span>
        )}
      </div>
    </div>
  )
}
