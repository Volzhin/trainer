import { useState } from 'react'
import type { FoodItem } from '../db/db'
import type { CustomFoodInput } from '../db/nutrition'

/**
 * Форма своего продукта. Пользовательские продукты — не запасной выход,
 * а обязательная часть дневника: никакая база не знает домашний борщ,
 * добавку из спортпита и локальную пекарню. Поэтому вводим по 100 г,
 * как на упаковке, и сохраняем для повторного использования.
 */

const num = (v: string): number => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const str = (v?: number) => (v == null ? '' : String(v))

export function CustomFoodForm({
  initial,
  initialName,
  barcode,
  submitLabel = 'Сохранить продукт',
  onSubmit,
  onCancel,
  cancelLabel = 'Назад',
}: {
  /** Заполненный продукт — режим правки. */
  initial?: FoodItem
  /** Имя из строки поиска: пользователь уже набрал, что искал. */
  initialName?: string
  barcode?: string
  submitLabel?: string
  onSubmit: (input: CustomFoodInput) => void | Promise<void>
  onCancel: () => void
  cancelLabel?: string
}) {
  const [name, setName] = useState(initial?.name ?? initialName ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [unit, setUnit] = useState<'г' | 'мл'>(initial?.unit ?? 'г')
  const [kcal, setKcal] = useState(str(initial?.per100.kcal))
  const [protein, setProtein] = useState(str(initial?.per100.protein))
  const [fat, setFat] = useState(str(initial?.per100.fat))
  const [carbs, setCarbs] = useState(str(initial?.per100.carbs))
  const [serving, setServing] = useState(str(initial?.serving_size))
  const [servingLabel, setServingLabel] = useState(initial?.serving_label ?? '')
  const [more, setMore] = useState(false)
  const [fiber, setFiber] = useState(str(initial?.per100.fiber))
  const [sugar, setSugar] = useState(str(initial?.per100.sugar))
  const [sodium, setSodium] = useState(str(initial?.per100.sodium))
  const [busy, setBusy] = useState(false)

  // Калории можно не вводить руками: из белков, жиров и углеводов они считаются.
  const computedKcal = Math.round(num(protein) * 4 + num(fat) * 9 + num(carbs) * 4)
  const kcalValue = kcal.trim() ? Math.round(num(kcal)) : computedKcal
  const mismatch =
    kcal.trim() && computedKcal > 0 && Math.abs(kcalValue - computedKcal) > Math.max(20, computedKcal * 0.2)

  const macroSum = num(protein) + num(fat) + num(carbs)
  const tooMuch = macroSum > 100

  const valid = name.trim().length > 0 && kcalValue > 0 && !tooMuch

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(),
        brand: brand.trim() || undefined,
        unit,
        per100: {
          kcal: kcalValue,
          protein: num(protein),
          fat: num(fat),
          carbs: num(carbs),
          fiber: fiber.trim() ? num(fiber) : undefined,
          sugar: sugar.trim() ? num(sugar) : undefined,
          sodium: sodium.trim() ? num(sodium) : undefined,
        },
        serving_size: serving.trim() ? num(serving) : undefined,
        serving_label: servingLabel.trim() || undefined,
        barcode: barcode ?? initial?.barcode,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label>Название</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Борщ домашний"
          autoFocus
        />
      </div>

      <div className="field">
        <label>Бренд или уточнение</label>
        <input
          className="input"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="необязательно"
        />
      </div>

      <div className="field">
        <label>Считаем на 100</label>
        <div className="segmented">
          <button className={unit === 'г' ? 'on' : ''} onClick={() => setUnit('г')}>
            граммов
          </button>
          <button className={unit === 'мл' ? 'on' : ''} onClick={() => setUnit('мл')}>
            миллилитров
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Num label="Белки, г" value={protein} onChange={setProtein} />
        <Num label="Жиры, г" value={fat} onChange={setFat} />
        <Num label="Углеводы, г" value={carbs} onChange={setCarbs} />
      </div>

      <div className="field">
        <label>Калории на 100 {unit}</label>
        <input
          className="input"
          inputMode="numeric"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder={computedKcal ? `${computedKcal} — посчитаем сами` : '0'}
        />
        {mismatch ? (
          <div className="mute-sm" style={{ marginTop: 6, color: 'var(--warn)' }}>
            По белкам, жирам и углеводам выходит {computedKcal} ккал. Проверьте упаковку.
          </div>
        ) : !kcal.trim() && computedKcal > 0 ? (
          <div className="mute-sm" style={{ marginTop: 6 }}>
            Оставьте пустым — запишем {computedKcal} ккал по макронутриентам.
          </div>
        ) : null}
      </div>

      {tooMuch && (
        <div className="mute-sm" style={{ color: 'var(--danger)' }}>
          Белки, жиры и углеводы дают {Math.round(macroSum)} г на 100 {unit} — больше самого
          продукта. Скорее всего, значения указаны не на 100 {unit}.
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <div className="field grow">
          <label>Порция, {unit}</label>
          <input
            className="input"
            inputMode="decimal"
            value={serving}
            onChange={(e) => setServing(e.target.value)}
            placeholder="необязательно"
          />
        </div>
        <div className="field grow">
          <label>Название порции</label>
          <input
            className="input"
            value={servingLabel}
            onChange={(e) => setServingLabel(e.target.value)}
            placeholder="тарелка"
          />
        </div>
      </div>

      {more ? (
        <div className="row" style={{ gap: 8 }}>
          <Num label="Клетчатка" value={fiber} onChange={setFiber} />
          <Num label="Сахар" value={sugar} onChange={setSugar} />
          <Num label="Натрий, мг" value={sodium} onChange={setSodium} />
        </div>
      ) : (
        <button className="btn ghost sm block" onClick={() => setMore(true)}>
          Клетчатка, сахар, натрий
        </button>
      )}

      {barcode && <div className="mute-sm">Штрихкод: {barcode}</div>}

      <button className="btn primary block" disabled={!valid || busy} onClick={submit}>
        {busy ? 'Сохраняю…' : submitLabel}
      </button>
      <button className="btn ghost block" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field grow">
      <label>{label}</label>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </div>
  )
}
