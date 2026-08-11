import { useEffect, useRef, useState } from 'react'
import type { FoodItem, MealSlot } from '../db/db'
import { logFood, recentFoods, saveCustomFood, searchCachedFoods } from '../db/nutrition'
import { findByBarcode, scaleNutrients, searchFood } from '../lib/foodApi'
import { BarcodeScanner } from './BarcodeScanner'
import { CustomFoodForm } from './CustomFoodForm'
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
  /** Открыта форма своего продукта; строка — предзаполненный штрихкод. */
  const [creating, setCreating] = useState<{ barcode?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const abortRef = useRef<AbortController>()

  // Кеш отвечает сразу и работает офлайн — показываем его, не дожидаясь сети.
  useEffect(() => {
    if (!slot) return
    void (query.trim() ? searchCachedFoods(query, userId) : recentFoods(20, userId)).then(
      setLocal,
    )
  }, [query, slot, userId, creating])

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
      setCreating(null)
      abortRef.current?.abort()
    }
  }, [slot])

  const lookup = async (code: string) => {
    setLoading(true)
    try {
      const found = await findByBarcode(code.trim())
      if (!found) {
        // База штрихкодов неполная по России — сразу предлагаем завести свой.
        toast('Такого штрихкода нет в базе — заполните сами')
        setCreating({ barcode: code.trim() })
        return
      }
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
  // Свои и найденные раньше разводим по разным блокам: своим доверия больше.
  const mine = local.filter((f) => f.source === 'manual')
  const cached = local.filter((f) => f.source !== 'manual')

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
                <span className="value figures">
                  {preview.kcal} ккал
                </span>
              </div>
              <div className="group-row">
                <span className="grow title">Белки · Жиры · Углеводы</span>
                <span className="value figures">
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
      ) : creating ? (
        <CustomFoodForm
          initialName={query.trim()}
          barcode={creating.barcode}
          submitLabel="Сохранить и добавить"
          cancelLabel="Назад к поиску"
          onCancel={() => setCreating(null)}
          onSubmit={async (input) => {
            const food = await saveCustomFood(input, userId)
            haptics.success()
            toast('Продукт сохранён — теперь он в ваших')
            setCreating(null)
            pick(food)
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
            <button className="btn sm grow" onClick={() => setCreating({})}>
              Создать продукт
            </button>
          </div>

          {mine.length > 0 && (
            <>
              <div className="section-title">Мои продукты</div>
              <div className="group">
                {mine.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {cached.length > 0 && (
            <>
              <div className="section-title">
                {query.trim() ? 'Уже записывали' : 'Недавние'}
              </div>
              <div className="group">
                {cached.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {(extra.length > 0 || loading) && (
            <>
              <div className="section-title">База продуктов{loading ? ' · ищу…' : ''}</div>
              <div className="group">
                {extra.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
              </div>
            </>
          )}

          {!loading && !local.length && !extra.length && query.trim().length >= 3 && (
            <div className="empty" style={{ padding: 20 }}>
              Ничего не нашлось.
              <button
                className="btn block"
                style={{ marginTop: 12 }}
                onClick={() => setCreating({})}
              >
                Создать «{query.trim()}»
              </button>
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
        <span className="title">
          {food.name}
          {food.source === 'manual' && (
            <span className="tag" style={{ marginLeft: 6 }}>
              своё
            </span>
          )}
        </span>
        <span className="sub" style={{ display: 'block' }}>
          {food.brand ? `${food.brand} · ` : ''}
          {food.per100.kcal} ккал на 100 {food.unit}
        </span>
      </span>
    </button>
  )
}
