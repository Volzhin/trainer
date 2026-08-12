import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FoodLog, type MealSlot } from '../db/db'
import { deleteFoodLog, loadPlan, logsForDate, sumNutrients } from '../db/nutrition'
import { localDate } from '../lib/tdee'
import { FoodPicker } from '../components/FoodPicker'
import { MacroRings } from '../components/MacroRings'
import { NutritionDayReport } from '../components/NutritionDayReport'
import { ManualNutritionReport } from '../components/ManualNutritionReport'
import { IconBack, IconChevronRight, IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

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
  const [params] = useSearchParams()
  // Из списка несданного в «Отчётах» приходят сразу на нужный день: сдавать
  // его человек будет, глядя на то, что в этот день ел.
  const [date, setDate] = useState(() => params.get('date') || localDate())
  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null)

  const version = useLiveQuery(() => db.foodLogs.count(), [])
  const logs = useLiveQuery(
    () => logsForDate(date, userId),
    [date, userId, version],
    [] as FoodLog[],
  )
  const plan = useLiveQuery(() => loadPlan(userId), [userId, version])

  const eaten = useMemo(() => sumNutrients(logs ?? []), [logs])
  // Цели может не быть вовсе — тогда экран показывает только съеденное.
  // Раньше здесь стоял ноль, и любая еда объявлялась превышением нормы.
  const target = plan?.target ?? null
  const over = target != null && eaten.kcal > target

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
          <h1>{t('Питание')}</h1>
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
          aria-label={t('Настройки питания')}
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      <div className="cal-nav mb-4">
        <button className="icon-btn" onClick={() => shiftDay(-1)} aria-label={t('Предыдущий день')}>
          <IconBack size={16} />
        </button>
        <div className="grow" style={{ textAlign: 'center' }}>
          <div className="strong">
            {isToday
              ? t('Сегодня')
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
          aria-label={t('Следующий день')}
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
          macros={plan?.macros ?? { protein: null, fat: null, carbs: null }}
        />
        <div className="row between mt-4">
          {target == null ? (
            <>
              <span className="mute-sm">{t('Съедено')}</span>
              <span className="figures strong">{eaten.kcal} ккал</span>
            </>
          ) : (
            <>
              <span className="mute-sm">{over ? t('Превышение') : t('Осталось')}</span>
              <span className="figures strong">
                {over ? eaten.kcal - target : target - eaten.kcal} ккал
              </span>
            </>
          )}
        </div>
        {target == null && (
          <div className="mute-sm mt-2">
            Тренер пока не выдал норму по калориям — записи сохраняются, цель появится
            вместе с рекомендациями.
          </div>
        )}
      </div>

      {plan?.fromCoach && plan.profile.coach_note && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--accent)' }}>
          <div className="mute-sm">{t('Комментарий тренера')}</div>
          <div className="mt-1">{plan.profile.coach_note}</div>
        </div>
      )}

      {SLOTS.map(({ key, label }) => {
        const items = (logs ?? []).filter((l) => l.slot === key)
        const sum = sumNutrients(items)
        return (
          <div key={key}>
            <div className="section-title">
              {t(label)}
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
                    <span className="sub">
                      {l.amount} {l.unit}
                      {l.brand ? ` · ${l.brand}` : ''} · Б {l.nutrients.protein} Ж{' '}
                      {l.nutrients.fat} У {l.nutrients.carbs}
                    </span>
                  </span>
                  <span className="value figures">
                    {l.nutrients.kcal}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={t('Удалить')}
                    onClick={async () => {
                      await deleteFoodLog(l.id)
                      toast(t('Запись удалена'))
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
                <span className="grow title">{t('Добавить')}</span>
              </button>
            </div>
          </div>
        )
      })}

      {/* Ручной отчёт стоит перед отчётом тренеру: сначала человек
          переносит цифры, потом сдаёт день. */}
      <ManualNutritionReport key={`m-${date}`} date={date} />

      {/* key по дате: при переходе на другой день черновик отчёта должен
          начинаться заново, а не переезжать с предыдущего. */}
      <NutritionDayReport key={date} date={date} />

      <div className="group mt-5">
        <button className="group-row" onClick={() => nav('/nutrition/foods')}>
          <span className="grow">
            <span className="title">{t('Мои продукты')}</span>
            <span className="sub">
              {t('Домашние блюда и то, чего нет в базе')}
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
        onAdded={() => toast(t('Записано'))}
      />
    </div>
  )
}
