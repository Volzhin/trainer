import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FoodItem } from '../db/db'
import { deleteCustomFood, myFoods, saveCustomFood, updateCustomFood } from '../db/nutrition'
import { CustomFoodForm } from '../components/CustomFoodForm'
import { Sheet } from '../components/Sheet'
import { IconBack, IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Свои продукты: домашние блюда и товары, которых нет во внешней базе.
 * Отдельный экран нужен, потому что такой продукт живёт долго — его
 * правят, когда меняется рецепт, и удаляют, когда он больше не нужен.
 */
export function MyFoods() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [editing, setEditing] = useState<FoodItem | null>(null)
  const [creating, setCreating] = useState(false)

  const version = useLiveQuery(() => db.foods.count(), [])
  const foods = useLiveQuery(() => myFoods(userId), [userId, version], [] as FoodItem[])
  const usage = useLiveQuery(
    async () => {
      const logs = await db.foodLogs.where('user_id').equals(userId).toArray()
      const map = new Map<string, number>()
      for (const l of logs) {
        if (l.food_id) map.set(l.food_id, (map.get(l.food_id) ?? 0) + 1)
      }
      return map
    },
    [userId, version],
    new Map<string, number>(),
  )

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{t('Мои продукты')}</h1>
          <div className="sub">{t('Своя база — она всегда точнее общей')}</div>
        </div>
      </div>

      <button className="btn primary block" onClick={() => setCreating(true)}>
        <IconPlus size={18} /> {t('Создать продукт')}
      </button>

      {(foods ?? []).length === 0 ? (
        <div className="empty mt-4">
          {t('Пока пусто. Заведите домашнее блюдо или товар, которого нет в базе, — дальше он будет подставляться в дневник в одно нажатие.')}
        </div>
      ) : (
        <div className="group mt-4">
          {(foods ?? []).map((f) => {
            const used = usage?.get(f.id) ?? 0
            return (
              <div className="group-row" key={f.id}>
                <button
                  className="grow"
                  style={{ textAlign: 'left', background: 'none', border: 'none', minWidth: 0 }}
                  onClick={() => setEditing(f)}
                >
                  <span className="title truncate" style={{ display: 'block' }}>
                    {f.name}
                  </span>
                  <span className="sub">
                    {f.brand ? `${f.brand} · ` : ''}
                    {f.per100.kcal} {t('ккал')} · {t('Б')} {f.per100.protein} · {t('Ж')} {f.per100.fat} · {t('У')}{' '}
                    {f.per100.carbs} {t('на 100')} {t(f.unit)}
                    {used > 0 ? ` · ${t('в дневнике')} ${used}` : ''}
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('Удалить')}
                  onClick={async () => {
                    await deleteCustomFood(f.id)
                    haptics.impact()
                    toast(t('Продукт удалён — записи в дневнике остались'))
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="mute-sm mt-3">
        {t('Записи в дневнике хранят копию состава на момент добавления, поэтому правки и удаление продукта не меняют прошлые дни.')}
      </div>

      <Sheet open={creating} title={t('Новый продукт')} onClose={() => setCreating(false)}>
        {creating && (
          <CustomFoodForm
            onCancel={() => setCreating(false)}
            cancelLabel={t('Отмена')}
            onSubmit={async (input) => {
              await saveCustomFood(input, userId)
              haptics.success()
              toast(t('Продукт сохранён'))
              setCreating(false)
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!editing} title={t('Продукт')} onClose={() => setEditing(null)}>
        {editing && (
          <CustomFoodForm
            initial={editing}
            submitLabel={t('Сохранить изменения')}
            cancelLabel={t('Отмена')}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await updateCustomFood(editing.id, input)
              haptics.success()
              toast(t('Изменения сохранены'))
              setEditing(null)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}
