import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NutritionGoal } from '../db/db'
import { expenditureTrend, loadPlan, updateNutritionProfile } from '../db/nutrition'
import { ACTIVITY_LEVELS, MACRO_PRESETS, MIN_DAYS_FOR_ADAPTIVE } from '../lib/tdee'
import { LineChart } from '../components/LineChart'
import { IconBack } from '../components/Icons'
import { useApp } from '../store/app'

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

  if (!plan) return <div className="screen">Загрузка…</div>

  const patch = async (p: Parameters<typeof updateNutritionProfile>[0]) => {
    setSaving(true)
    await updateNutritionProfile(p, userId)
    setSaving(false)
  }

  const adaptive = plan.expenditure.source === 'adaptive'

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>Расчёт питания</h1>
          <div className="sub">{adaptive ? 'По вашим данным' : 'Оценка по формуле'}</div>
        </div>
      </div>

      <div className="card">
        <div className="metrics">
          <div className="metric">
            <div className="num">{plan.expenditure.tdee}</div>
            <div className="cap">расход, ккал</div>
          </div>
          <div className="metric">
            <div className="num">{plan.target}</div>
            <div className="cap">цель, ккал</div>
          </div>
        </div>

        <div className="muted" style={{ marginTop: 14 }}>
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

        <div className="bar" style={{ marginTop: 12 }}>
          <i style={{ width: `${Math.round(plan.expenditure.confidence * 100)}%` }} />
        </div>
        <div className="mute-sm" style={{ marginTop: 6 }}>
          Точность расчёта · {Math.round(plan.expenditure.confidence * 100)}%
        </div>
      </div>

      {trend && trend.length > 1 && (
        <>
          <div className="section-title">Тренд расхода</div>
          <div className="card">
            <LineChart data={trend} unit=" ккал" />
            <div className="mute-sm" style={{ textAlign: 'center', marginTop: 6 }}>
              Как менялся ваш обмен веществ
            </div>
          </div>
        </>
      )}

      <div className="section-title">Цель</div>
      <div className="segmented">
        {GOALS.map((g) => (
          <button
            key={g.key}
            className={plan.profile.goal === g.key ? 'on' : ''}
            onClick={() => patch({ goal: g.key, weekly_change_kg: g.weekly })}
          >
            {g.label}
          </button>
        ))}
      </div>

      {plan.profile.goal !== 'maintain' && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="mute-sm">Скорость, кг в неделю</span>
            <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>
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

      <div className="section-title">Распределение макросов</div>
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
                <span className="title">{preset.label}</span>
                <span className="sub" style={{ display: 'block' }}>
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
          <div className="section-title">Активность</div>
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
                  <span className="title">{a.label}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {a.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Ручная поправка</div>
      <div className="card">
        <div className="muted">
          Если по своим наблюдениям расход отличается — сместите его вручную.
        </div>
        <div className="segmented" style={{ marginTop: 12 }}>
          {[-200, -100, 0, 100, 200].map((v) => (
            <button
              key={v}
              className={(plan.profile.manual_offset ?? 0) === v ? 'on' : ''}
              onClick={() => {
                patch({ manual_offset: v })
                toast(v === 0 ? 'Поправка снята' : `Поправка ${v > 0 ? '+' : ''}${v} ккал`)
              }}
            >
              {v > 0 ? `+${v}` : v}
            </button>
          ))}
        </div>
      </div>

      <div className="mute-sm" style={{ marginTop: 20, textAlign: 'center' }}>
        Данные о продуктах — Open Food Facts, открытая база со штрихкодами.
      </div>
    </div>
  )
}
