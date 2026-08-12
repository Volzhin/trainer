import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NutritionGoal } from '../db/db'
import { expenditureTrend, loadPlan, updateNutritionProfile } from '../db/nutrition'
import { ACTIVITY_LEVELS, MACRO_PRESETS, MIN_DAYS_FOR_ADAPTIVE } from '../lib/tdee'
import { LineChart } from '../components/LineChart'
import { IconBack } from '../components/Icons'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

const GOALS: { key: NutritionGoal; label: string; weekly: number }[] = [
  { key: 'lose', label: 'Снижать вес', weekly: -0.5 },
  { key: 'maintain', label: 'Держать вес', weekly: 0 },
  { key: 'gain', label: 'Набирать', weekly: 0.25 },
]

/**
 * Настройки питания и объяснение расчёта. Показываем, откуда взялась цифра:
 * доверие к адаптивному расходу возникает только когда видно, на чём он основан.
 */
export function NutritionSettings() {
  const nav = useNavigate()
  const { userId, toast } = useApp()
  const [saving, setSaving] = useState(false)

  const version = useLiveQuery(() => db.foodLogs.count(), [])
  const plan = useLiveQuery(() => loadPlan(userId), [userId, version, saving])
  const trend = useLiveQuery(() => expenditureTrend(userId), [userId, version], [])

  if (!plan) return <div className="screen">{t('Загрузка…')}</div>

  const patch = async (p: Parameters<typeof updateNutritionProfile>[0]) => {
    setSaving(true)
    await updateNutritionProfile(p, userId)
    setSaving(false)
  }

  const adaptive = plan.expenditure.source === 'adaptive'

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{t('Расчёт питания')}</h1>
          <div className="sub">{adaptive ? t('По вашим данным') : t('Оценка по формуле')}</div>
        </div>
      </div>

      <div className="card">
        <div className="metrics">
          <div className="metric">
            <div className="num">{plan.expenditure.tdee}</div>
            <div className="cap">{t('расход, ккал')}</div>
          </div>
          <div className="metric">
            {/* Цели может не быть: тренер её не выдал. Прочерк вместо пустого
                места — иначе плитка выглядит сломанной, а не пустой. */}
            <div className="num">{plan.target ?? '—'}</div>
            <div className="cap">{t('цель, ккал')}</div>
          </div>
        </div>

        <div className="muted mt-4">
          {adaptive ? (
            <>
              Расход выведен из того, сколько вы ели и как менялся вес за последние{' '}
              {plan.expenditure.daysUsed} дней.
              {plan.expenditure.weeklyChangeKg != null &&
                ` Вес меняется на ${plan.expenditure.weeklyChangeKg} кг в неделю.`}
            </>
          ) : (
            <>
              Пока это оценка по формуле ({plan.formula} ккал). Заполните дневник и вес хотя бы{' '}
              {MIN_DAYS_FOR_ADAPTIVE} дней — расчёт перейдёт на ваши реальные данные и учтёт
              замедление обмена.
            </>
          )}
        </div>

        <div className="bar mt-3">
          <i style={{ width: `${Math.round(plan.expenditure.confidence * 100)}%` }} />
        </div>
        <div className="mute-sm mt-2">
          Точность расчёта · {Math.round(plan.expenditure.confidence * 100)}%
        </div>
      </div>

      {trend && trend.length > 1 && (
        <>
          <div className="section-title">{t('Тренд расхода')}</div>
          <div className="card">
            <LineChart data={trend} unit=" ккал" />
            <div className="mute-sm" style={{ textAlign: 'center', marginTop: 8 }}>
              {t('Как менялся ваш обмен веществ')}
            </div>
          </div>
        </>
      )}

      {plan.fromCoach && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--accent)' }}>
          <div className="strong">{t('Норму назначил тренер')}</div>
          <div className="muted mt-1">
            Цель и макросы заданы им, поэтому расчёт приложения на них не влияет. Свои настройки
            заработают, когда тренер снимет норму.
          </div>
        </div>
      )}

      <div className="section-title">{t('Цель')}</div>
      <div className="segmented">
        {GOALS.map((g) => (
          <button
            key={g.key}
            className={plan.profile.goal === g.key ? 'on' : ''}
            onClick={() => patch({ goal: g.key, weekly_change_kg: g.weekly })}
          >
            {t(g.label)}
          </button>
        ))}
      </div>

      {plan.profile.goal !== 'maintain' && (
        <div className="card mt-3">
          <div className="row between mb-2">
            <span className="mute-sm">{t('Скорость, кг в неделю')}</span>
            <span className="figures strong">
              {plan.profile.weekly_change_kg}
            </span>
          </div>
          <div className="segmented">
            {(plan.profile.goal === 'lose' ? [-0.25, -0.5, -0.75, -1] : [0.125, 0.25, 0.5]).map(
              (v) => (
                <button
                  key={v}
                  className={plan.profile.weekly_change_kg === v ? 'on' : ''}
                  onClick={() => patch({ weekly_change_kg: v })}
                >
                  {v > 0 ? `+${v}` : v}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="section-title">{t('Распределение макросов')}</div>
      <div className="group">
        {Object.entries(MACRO_PRESETS).map(([key, preset]) => {
          const active =
            Math.abs(plan.profile.macro_split.protein - preset.split.protein) < 0.01 &&
            Math.abs(plan.profile.macro_split.fat - preset.split.fat) < 0.01
          return (
            <button
              key={key}
              className="group-row"
              onClick={() => patch({ macro_split: preset.split })}
              style={active ? { background: 'var(--accent-soft)' } : undefined}
            >
              <span className="grow">
                <span className="title">{t(preset.label)}</span>
                <span className="sub">
                  Б {Math.round(preset.split.protein * 100)}% · Ж{' '}
                  {Math.round(preset.split.fat * 100)}% · У{' '}
                  {Math.round(preset.split.carbs * 100)}%
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {!adaptive && (
        <>
          <div className="section-title">{t('Активность')}</div>
          <div className="group">
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.value}
                className="group-row"
                onClick={() => patch({ activity: a.value })}
                style={
                  plan.profile.activity === a.value
                    ? { background: 'var(--accent-soft)' }
                    : undefined
                }
              >
                <span className="grow">
                  <span className="title">{t(a.label)}</span>
                  <span className="sub">
                    {a.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">{t('Ручная поправка')}</div>
      <div className="card">
        <div className="muted">
          {t('Если по своим наблюдениям расход отличается — сместите его вручную.')}
        </div>
        <div className="segmented mt-3">
          {[-200, -100, 0, 100, 200].map((v) => (
            <button
              key={v}
              className={(plan.profile.manual_offset ?? 0) === v ? 'on' : ''}
              onClick={() => {
                patch({ manual_offset: v })
                toast(v === 0 ? t('Поправка снята') : `Поправка ${v > 0 ? '+' : ''}${v} ккал`)
              }}
            >
              {v > 0 ? `+${v}` : v}
            </button>
          ))}
        </div>
      </div>

      <div className="mute-sm" style={{ marginTop: 20, textAlign: 'center' }}>
        {t('Данные о продуктах — Open Food Facts, открытая база со штрихкодами.')}
      </div>
    </div>
  )
}
