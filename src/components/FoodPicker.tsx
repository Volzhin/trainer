import { useEffect, useRef, useState } from 'react'
import type { FoodItem, MealSlot } from '../db/db'
import { logFood, logQuick, recentFoods, searchCachedFoods } from '../db/nutrition'
import { findByBarcode, scaleNutrients, searchFood } from '../lib/foodApi'
import { BarcodeScanner } from './BarcodeScanner'
import { Sheet } from './Sheet'
import { IconSearch } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/**
 * Выбор продукта.
 *
 * Логирование — самое частое и самое раздражающее действие в дневнике,
 * поэтому путь построен от быстрого к медленному: сначала мгновенный
 * локальный кеш, потом сеть, и только затем ручной ввод. Сетевой запрос
 * идёт с задержкой и отменяется при следующем нажатии клавиши.
 */
export function FoodPicker({
  slot,
  date,
  onClose,
  onAdded,
}: {
  slot: MealSlot | null
  date: string
  onClose: () => void
  onAdded: () => void
}) {
  const { toast, userId } = useApp()
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState<FoodItem[]>([])
  const [remote, setRemote] = useState<FoodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [chosen, setChosen] = useState<FoodItem | null>(null)
  const [amount, setAmount] = useState('100')
  const [manual, setManual] = useState(false)
  const [scanning, setScanning] = useState(false)
  const abortRef = useRef<AbortController>()

  // Кеш отвечает сразу и работает офлайн — показываем его, не дожидаясь сети.
  useEffect(() => {
    if (!slot) return
    void (query.trim() ? searchCachedFoods(query) : recentFoods()).then(setLocal)
  }, [query, slot])

  // Сеть — с задержкой: иначе на каждую букву уходит запрос.
  useEffect(() => {
    const term = query.trim()
    setRemote([])
    if (!slot || term.length < 3) return

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        setRemote(await searchFood(term, controller.signal))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setRemote([])
      } finally {
        setLoading(false)
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [query, slot])

  useEffect(() => {
    if (!slot) {
      setQuery('')
      setChosen(null)
      setManual(false)
      abortRef.current?.abort()
    }
  }, [slot])

  const lookup = async (code: string) => {
    setLoading(true)
    try {
      const found = await findByBarcode(code.trim())
      if (!found) return toast('Продукт не найден по штрихкоду')
      haptics.impact()
      pick(found)
    } catch {
      toast('Нет связи с базой продуктов')
    } finally {
      setLoading(false)
    }
  }

  const pick = (food: FoodItem) => {
    setChosen(food)
    // Подставляем порцию поставщика, если она есть: «1 бутылка» вместо «1 г».
    setAmount(String(food.serving_size && food.serving_size > 0 ? food.serving_size : 100))
  }

  const confirm = async () => {
    if (!chosen || !slot) return
    const value = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return toast('Укажите количество')

    await logFood({ food: chosen, amount: value, slot, date, userId })
    haptics.success()
    onAdded()
    setChosen(null)
    setQuery('')
    onClose()
  }

  // Продукты из сети, которых нет в кеше, — чтобы не дублировать строки.
  const localIds = new Set(local.map((f) => f.id))
  const extra = remote.filter((f) => !localIds.has(f.id))

  const preview = chosen ? scaleNutrients(chosen.per100, parseFloat(amount) || 0) : null

  return (
    <Sheet open={!!slot} title={chosen ? chosen.name : 'Что вы съели'} onClose={onClose}>
      {chosen ? (
        <div className="stack">
          {chosen.brand && <div className="mute-sm">{chosen.brand}</div>}

          <div className="field">
            <label>Количество, {chosen.unit}</label>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {chosen.serving_size ? (
            <div className="chips" style={{ margin: 0, padding: 0 }}>
              {[chosen.serving_size, 100, 150, 200, 250].map((v, i) => (
                <button
                  key={`${v}-${i}`}
                  className={`chip${Number(amount) === v ? ' active' : ''}`}
                  onClick={() => setAmount(String(v))}
                >
                  {v} {chosen.unit}
                </button>
              ))}
            </div>
          ) : null}

          {preview && (
            <div className="group">
              <div className="group-row">
                <span className="grow title">Калории</span>
                <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                  {preview.kcal} ккал
                </span>
              </div>
              <div className="group-row">
                <span className="grow title">Белки · Жиры · Углеводы</span>
                <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                  {preview.protein} · {preview.fat} · {preview.carbs} г
                </span>
              </div>
            </div>
          )}

          <button className="btn primary block" onClick={confirm}>
            Записать
          </button>
          <button className="btn ghost block" onClick={() => setChosen(null)}>
            Выбрать другое
          </button>
        </div>
      ) : manual ? (
        <ManualEntry
          onCancel={() => setManual(false)}
          onSave={async (name, nutrients) => {
            if (!slot) return
            await logQuick({ name, nutrients, slot, date, userId })
            haptics.success()
            onAdded()
            setManual(false)
            onClose()
          }}
        />
      ) : (
        <div className="stack">
          <div className="search">
            <IconSearch />
            <input
              className="input"
              placeholder="Название продукта"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm grow" onClick={() => setScanning(true)}>
              По штрихкоду
            </button>
            <button className="btn sm grow" onClick={() => setManual(true)}>
              Ввести вручную
            </button>
          </div>

          {local.length > 0 && (
            <>
              <div className="section-title">
                {query.trim() ? 'Из ваших продуктов' : 'Недавние'}
              </div>
              <div className="group">
                {local.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {(extra.length > 0 || loading) && (
            <>
              <div className="section-title">
                База продуктов{loading ? ' · ищу…' : ''}
              </div>
              <div className="group">
                {extra.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {!loading && !local.length && !extra.length && query.trim().length >= 3 && (
            <div className="empty">
              Ничего не нашлось. Можно ввести продукт вручную.
            </div>
          )}
        </div>
      )}
      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false)
          void lookup(code)
        }}
      />
    </Sheet>
  )
}

function FoodRow({ food, onPick }: { food: FoodItem; onPick: (f: FoodItem) => void }) {
  return (
    <button className="group-row" onClick={() => onPick(food)}>
      {food.image_url ? (
        <img src={food.image_url} alt="" className="ex-thumb" loading="lazy" />
      ) : (
        <span className="ex-thumb placeholder" />
      )}
      <span className="grow">
        <span className="title">{food.name}</span>
        <span className="sub" style={{ display: 'block' }}>
          {food.brand ? `${food.brand} · ` : ''}
          {food.per100.kcal} ккал на 100 {food.unit}
        </span>
      </span>
    </button>
  )
}

/** Ручной ввод — когда продукта нет в базе или это домашнее блюдо. */
function ManualEntry({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (name: string, n: { kcal: number; protein: number; fat: number; carbs: number }) => void
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carbs, setCarbs] = useState('')

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  return (
    <div className="stack">
      <div className="field">
        <label>Что это было</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Борщ домашний"
          autoFocus
        />
      </div>
      <div className="field">
        <label>Калории</label>
        <input
          className="input"
          inputMode="numeric"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="450"
        />
      </div>
      <div className="row" style={{ gap: 8 }}>
        {[
          ['Белки', protein, setProtein],
          ['Жиры', fat, setFat],
          ['Углеводы', carbs, setCarbs],
        ].map(([label, value, set]) => (
          <div className="field grow" key={label as string}>
            <label>{label as string}</label>
            <input
              className="input"
              inputMode="decimal"
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <button
        className="btn primary block"
        disabled={!name.trim() || !num(kcal)}
        onClick={() =>
          onSave(name, {
            kcal: Math.round(num(kcal)),
            protein: num(protein),
            fat: num(fat),
            carbs: num(carbs),
          })
        }
      >
        Записать
      </button>
      <button className="btn ghost block" onClick={onCancel}>
        Назад к поиску
      </button>
    </div>
  )
}
