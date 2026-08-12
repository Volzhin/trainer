import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NutritionDay } from '../db/db'
import { setSatiety, submitNutritionDay } from '../db/reports'
import { useApp, useTrainerLink } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/** 5 — сытый, 1 — очень голодный. Формулировки живут здесь одни на всех. */
export const SATIETY_LABELS: Record<number, string> = {
  1: 'очень голодный',
  2: 'голодный',
  3: 'нормально',
  4: 'сытый',
  5: 'очень сытый',
}

/**
 * Сдача дня питания — прямо в дневнике, под тем, что человек за день съел.
 *
 * Отдельным экраном это уже было и не работало: сытость и «что помешало»
 * вспоминаются глядя на записи дня, а не по названию даты в списке отчётов.
 * В «Отчётах» остался список несданного, который сюда и приводит.
 *
 * Клиент видит у дня два состояния — сдан и не сдан. Проверил ли тренер,
 * не показано и показано быть не может: отметка о проверке принадлежит ему
 * и на устройство клиента не приезжает. Ответ тренера — другое дело, он
 * адресован клиенту и лежит на самом дне.
 */
export function NutritionDayReport({ date }: { date: string }) {
  const { toast, userId } = useApp()
  const bond = useTrainerLink()

  const day = useLiveQuery(() => db.nutritionDays.get(`${userId}:${date}`), [userId, date])
  const logs = useLiveQuery(
    () => db.foodLogs.where('[user_id+date]').equals([userId, date]).count(),
    [userId, date],
  )

  const [draft, setDraft] = useState<{
    satiety?: NutritionDay['satiety']
    comment: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  // Без тренера сдавать некому, а пустой день — не отчёт: просить отчитаться
  // о дне, в котором ничего не записано, значит просить выдумать.
  //
  // «Записано» — это и продукты в дневнике, и итог, перенесённый рукой из
  // стороннего счётчика. Пока учитывались только продукты, человек с
  // ручным отчётом не мог его сдать вовсе: блок сдачи ему не показывался.
  const m = day?.manual
  const hasManual = !!m && (m.kcal != null || m.protein != null || m.fat != null || m.carbs != null)
  if (!bond || (!logs && !hasManual)) return null

  const satiety = draft ? draft.satiety : day?.satiety
  const comment = draft ? draft.comment : (day?.comment ?? '')
  const submitted = day?.status === 'submitted'

  const send = async () => {
    setBusy(true)
    try {
      if (satiety) await setSatiety(date, satiety)
      await submitNutritionDay(date, comment)
      haptics.success()
      setDraft(null)
      toast(submitted ? 'День обновлён' : 'День сдан тренеру')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-title">
        Отчёт тренеру
        <span style={{ float: 'right' }}>
          <span className="badge">{submitted ? 'сдан' : 'не сдан'}</span>
        </span>
      </div>

      <div className="card">
        {day?.trainer_comment && (
          <div
            className="mute-sm quote mb-4"
          >
            <div>{t('Ответ тренера')}</div>
            <div style={{ color: 'var(--text)', marginTop: 4 }}>{day.trainer_comment}</div>
          </div>
        )}

        <div className="field">
          <label>{t('Насколько были сыты')}</label>
          <div className="chips">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button
                key={v}
                className={`chip${satiety === v ? ' active' : ''}`}
                onClick={() => {
                  haptics.selection()
                  setDraft({ satiety: v, comment })
                }}
              >
                {SATIETY_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="field mt-3">
          <label>{t('Комментарий')}</label>
          <textarea
            className="textarea"
            value={comment}
            onChange={(e) => setDraft({ satiety, comment: e.target.value })}
            placeholder={t('Что мешало держаться плана, что съели сверх нормы')}
          />
        </div>

        <button
          className="btn primary block mt-3"
          disabled={busy}
          onClick={send}
        >
          {submitted ? 'Обновить отчёт' : 'Сдать день тренеру'}
        </button>
      </div>
    </>
  )
}
