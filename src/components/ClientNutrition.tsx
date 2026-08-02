import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { nutritionSummary, setCoachTargets } from '../db/nutrition'
import { macroTargets } from '../lib/tdee'
import { LineChart } from '../components/LineChart'
import { Sheet } from './Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/**
 * Питание клиента глазами тренера: насколько плотно ведётся дневник,
 * что в среднем ест человек и держится ли он нормы. Плотность записей —
 * первое, на что смотрят: без неё остальные цифры не значат ничего.
 */
export function ClientNutrition({ clientId }: { clientId: string }) {
  const { userId, toast } = useApp()
  const [assignOpen, setAssignOpen] = useState(false)
  const [period, setPeriod] = useState(14)

  const version = useLiveQuery(() => db.foodLogs.count(), [])
  const profileVersion = useLiveQuery(() => db.nutritionProfile.count(), [])
  const summary = useLiveQuery(
    () => nutritionSummary(clientId, period),
    [clientId, period, version, profileVersion],
  )

  if (!summary) return <div className="empty">Загрузка…</div>

  const { plan } = summary
  const noData = summary.daysLogged === 0

  return (
    <div style={{ marginTop: 14 }}>
      <div className="segmented" style={{ marginBottom: 12 }}>
        {[7, 14, 30].map((d) => (
          <button key={d} className={period === d ? 'on' : ''} onClick={() => setPeriod(d)}>
            {d} дней
          </button>
        ))}
      </div>

      {noData ? (
        <div className="cal-empty">
          <div className="muted">Клиент ещё не вёл дневник питания</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="metrics">
              <div className="metric">
                <div className="num">{summary.avgKcal}</div>
                <div className="cap">в среднем, ккал</div>
              </div>
              <div className="metric">
                <div
                  className="num"
                  style={{
                    color:
                      Math.abs(summary.deviation) > 300 ? 'var(--warn)' : 'var(--ok)',
                  }}
                >
                  {summary.deviation > 0 ? '+' : ''}
                  {summary.deviation}
                </div>
                <div className="cap">отклонение от нормы</div>
              </div>
            </div>

            <div className="row between" style={{ marginTop: 16, marginBottom: 6 }}>
              <span className="mute-sm">Дней с записями</span>
              <span className="mute-sm" style={{ fontFamily: 'var(--font-num)' }}>
                {summary.daysLogged} из {summary.daysTotal}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${(summary.daysLogged / summary.daysTotal) * 100}%` }} />
            </div>
            {summary.daysLogged < summary.daysTotal / 2 && (
              <div className="mute-sm" style={{ marginTop: 10, color: 'var(--warn)' }}>
                Дневник заполняется реже половины дней — средние значения
                и расчёт расхода по ним ненадёжны.
              </div>
            )}
          </div>

          <div className="section-title">Калории по дням</div>
          <div className="card">
            <LineChart data={summary.points} unit=" ккал" />
            <div className="mute-sm" style={{ textAlign: 'center', marginTop: 6 }}>
              Норма {summary.target} ккал
            </div>
          </div>

          <div className="section-title">В среднем за день</div>
          <div className="group">
            <div className="group-row">
              <span className="grow title">Белки</span>
              <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                {summary.avgProtein} / {plan.macros.protein} г
              </span>
            </div>
            <div className="group-row">
              <span className="grow title">Жиры</span>
              <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                {summary.avgFat} / {plan.macros.fat} г
              </span>
            </div>
            <div className="group-row">
              <span className="grow title">Углеводы</span>
              <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                {summary.avgCarbs} / {plan.macros.carbs} г
              </span>
            </div>
          </div>
        </>
      )}

      <div className="section-title">Норма от вас</div>
      <div className="card">
        {plan.fromCoach ? (
          <>
            <div className="row between">
              <div className="grow">
                <div style={{ fontWeight: 700, fontSize: 17, fontFamily: 'var(--font-num)' }}>
                  {plan.target} ккал
                </div>
                <div className="mute-sm" style={{ marginTop: 2, fontFamily: 'var(--font-num)' }}>
                  Б {plan.macros.protein} · Ж {plan.macros.fat} · У {plan.macros.carbs} г
                </div>
              </div>
            </div>
            {plan.profile.coach_note && (
              <div
                className="mute-sm"
                style={{ marginTop: 12, paddingLeft: 10, borderLeft: '2px solid var(--accent)' }}
              >
                {plan.profile.coach_note}
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn sm grow" onClick={() => setAssignOpen(true)}>
                Изменить
              </button>
              <button
                className="btn sm ghost danger"
                onClick={async () => {
                  await setCoachTargets(clientId, null, userId)
                  toast('Норма снята — вернулся расчёт приложения')
                }}
              >
                Снять
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="muted">
              Норму считает приложение: {plan.target} ккал
              {plan.expenditure.source === 'adaptive'
                ? ' по фактическому расходу клиента.'
                : ' по формуле, данных пока мало.'}
            </div>
            <button
              className="btn primary block"
              style={{ marginTop: 14 }}
              onClick={() => setAssignOpen(true)}
            >
              Назначить свою норму
            </button>
          </>
        )}
      </div>

      <TargetSheet
        open={assignOpen}
        clientId={clientId}
        coachId={userId}
        suggested={{ kcal: plan.target, ...plan.macros }}
        current={
          plan.fromCoach
            ? { kcal: plan.target, ...plan.macros, note: plan.profile.coach_note }
            : undefined
        }
        onClose={() => setAssignOpen(false)}
        onSaved={() => toast('Норма назначена клиенту')}
      />
    </div>
  )
}

/** Назначение КБЖУ. Граммы пересчитываются из калорий, чтобы не считать вручную. */
function TargetSheet({
  open,
  clientId,
  coachId,
  suggested,
  current,
  onClose,
  onSaved,
}: {
  open: boolean
  clientId: string
  coachId: string
  suggested: { kcal: number; protein: number; fat: number; carbs: number }
  current?: { kcal: number; protein: number; fat: number; carbs: number; note?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const start = current ?? suggested
  const [kcal, setKcal] = useState(String(start.kcal))
  const [protein, setProtein] = useState(String(start.protein))
  const [fat, setFat] = useState(String(start.fat))
  const [carbs, setCarbs] = useState(String(start.carbs))
  const [note, setNote] = useState(current?.note ?? '')

  useEffect(() => {
    if (!open) return
    const s = current ?? suggested
    setKcal(String(s.kcal))
    setProtein(String(s.protein))
    setFat(String(s.fat))
    setCarbs(String(s.carbs))
    setNote(current?.note ?? '')
  }, [open])

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  /** Раскладка по долям — быстрее, чем подбирать граммы руками. */
  const applySplit = (split: { protein: number; fat: number; carbs: number }) => {
    const m = macroTargets(num(kcal), split)
    setProtein(String(m.protein))
    setFat(String(m.fat))
    setCarbs(String(m.carbs))
    haptics.selection()
  }

  // Сумма макросов в калориях — тренер должен видеть расхождение с нормой.
  const fromMacros = num(protein) * 4 + num(fat) * 9 + num(carbs) * 4
  const diff = Math.round(fromMacros - num(kcal))

  const save = async () => {
    await setCoachTargets(
      clientId,
      { kcal: Math.round(num(kcal)), protein: num(protein), fat: num(fat), carbs: num(carbs), note },
      coachId,
    )
    haptics.success()
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} title="Норма КБЖУ" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Калории</label>
          <input
            className="input"
            inputMode="numeric"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            style={{ fontFamily: 'var(--font-num)' }}
          />
        </div>

        <div className="field">
          <label>Разложить калории по долям</label>
          <div className="segmented">
            <button onClick={() => applySplit({ protein: 0.3, fat: 0.3, carbs: 0.4 })}>
              Баланс
            </button>
            <button onClick={() => applySplit({ protein: 0.4, fat: 0.25, carbs: 0.35 })}>
              Сушка
            </button>
            <button onClick={() => applySplit({ protein: 0.25, fat: 0.25, carbs: 0.5 })}>
              Набор
            </button>
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          {(
            [
              ['Белки', protein, setProtein],
              ['Жиры', fat, setFat],
              ['Углеводы', carbs, setCarbs],
            ] as const
          ).map(([label, value, set]) => (
            <div className="field grow" key={label}>
              <label>{label}, г</label>
              <input
                className="input"
                inputMode="decimal"
                value={value}
                onChange={(e) => set(e.target.value)}
                style={{ fontFamily: 'var(--font-num)' }}
              />
            </div>
          ))}
        </div>

        {Math.abs(diff) > 30 && (
          <div className="mute-sm" style={{ color: 'var(--warn)' }}>
            Макросы дают {Math.round(fromMacros)} ккал — на {diff > 0 ? '+' : ''}
            {diff} от указанной нормы.
          </div>
        )}

        <div className="field">
          <label>Комментарий клиенту</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: белок держим не ниже нормы, углеводы двигаем по самочувствию"
          />
        </div>

        <button className="btn primary block" disabled={!num(kcal)} onClick={save}>
          Назначить норму
        </button>
      </div>
    </Sheet>
  )
}
