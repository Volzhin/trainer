import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FoodLog, type MealSlot } from '../db/db'
import { deleteFoodLog, loadPlan, logsForDate, sumNutrients } from '../db/nutrition'
import { localDate } from '../lib/tdee'
import { FoodPicker } from '../components/FoodPicker'
import { MacroRings } from '../components/MacroRings'
import { IconBack, IconChevronRight, IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекусы' },
]

const DAY = 86400_000

/**
 * Дневник питания. День — единица работы: цель, съеденное и остаток
 * должны читаться с одного взгляда, без перехода на другие экраны.
 */
export function Nutrition() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [date, setDate] = useState(() => localDate())
  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null)

  const version = useLiveQuery(() => db.foodLogs.count(), [])
  const logs = useLiveQuery(
    () => logsForDate(date, userId),
    [date, userId, version],
    [] as FoodLog[],
  )
  const plan = useLiveQuery(() => loadPlan(userId), [userId, version])

  const eaten = useMemo(() => sumNutrients(logs ?? []), [logs])
  const target = plan?.target ?? 0
  const left = Math.max(0, target - eaten.kcal)

  const shiftDay = (dir: -1 | 1) => {
    haptics.selection()
    const ts = new Date(`${date}T12:00:00`).getTime() + dir * DAY
    setDate(localDate(ts))
  }

  const isToday = date === localDate()

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Питание</h1>
          <div className="sub">
            {plan?.fromCoach
              ? 'Норму назначил тренер'
              : plan?.expenditure.source === 'adaptive'
                ? `Расход по вашим данным · ${plan.expenditure.tdee} ккал`
                : 'Расход оценён по формуле'}
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => nav('/nutrition/settings')}
          aria-label="Настройки питания"
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      <div className="cal-nav" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => shiftDay(-1)} aria-label="Предыдущий день">
          <IconBack size={16} />
        </button>
        <div className="grow" style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>
            {isToday
              ? 'Сегодня'
              : new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                })}
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => shiftDay(1)}
          aria-label="Следующий день"
          disabled={isToday}
          style={isToday ? { opacity: 0.4 } : undefined}
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      <div className="card">
        <MacroRings
          eaten={eaten}
          target={target}
          macros={plan?.macros ?? { protein: 0, fat: 0, carbs: 0 }}
        />
        <div className="row between" style={{ marginTop: 16 }}>
          <span className="mute-sm">{eaten.kcal > target ? 'Превышение' : 'Осталось'}</span>
          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700 }}>
            {eaten.kcal > target ? eaten.kcal - target : left} ккал
          </span>
        </div>
      </div>

      {plan?.fromCoach && plan.profile.coach_note && (
        <div className="card" style={{ marginTop: 10, borderColor: 'var(--accent)' }}>
          <div className="mute-sm">Комментарий тренера</div>
          <div style={{ marginTop: 4 }}>{plan.profile.coach_note}</div>
        </div>
      )}

      {SLOTS.map(({ key, label }) => {
        const items = (logs ?? []).filter((l) => l.slot === key)
        const sum = sumNutrients(items)
        return (
          <div key={key}>
            <div className="section-title">
              {label}
              {items.length > 0 && (
                <span style={{ float: 'right', fontFamily: 'var(--font-num)' }}>
                  {sum.kcal} ккал
                </span>
              )}
            </div>
            <div className="group">
              {items.map((l) => (
                <div className="group-row" key={l.id}>
                  <span className="grow">
                    <span className="title">{l.name}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {l.amount} {l.unit}
                      {l.brand ? ` · ${l.brand}` : ''} · Б {l.nutrients.protein} Ж{' '}
                      {l.nutrients.fat} У {l.nutrients.carbs}
                    </span>
                  </span>
                  <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                    {l.nutrients.kcal}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Удалить"
                    onClick={async () => {
                      await deleteFoodLog(l.id)
                      toast('Запись удалена')
                    }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
              <button className="group-row" onClick={() => setPickerSlot(key)}>
                <span className="metric-icon" style={{ color: 'var(--accent-ink)' }}>
                  <IconPlus size={18} />
                </span>
                <span className="grow title">Добавить</span>
              </button>
            </div>
          </div>
        )
      })}

      <div className="group" style={{ marginTop: 18 }}>
        <button className="group-row" onClick={() => nav('/nutrition/foods')}>
          <span className="grow">
            <span className="title">Мои продукты</span>
            <span className="sub" style={{ display: 'block' }}>
              Домашние блюда и то, чего нет в базе
            </span>
          </span>
          <span className="chevron">
            <IconChevronRight size={16} />
          </span>
        </button>
      </div>

      <FoodPicker
        slot={pickerSlot}
        date={date}
        onClose={() => setPickerSlot(null)}
        onAdded={() => toast('Записано')}
      />
    </div>
  )
}
