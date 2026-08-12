import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { localDate } from '../lib/tdee'
import { formatDate } from '../lib/calc'
import { setManualNutrition } from '../db/reports'
import { addNutritionShot, deleteAttachment, nutritionShots } from '../db/coach'
import { Sheet } from './Sheet'
import { ShotThumb } from './ShotThumb'
import { IconPlus, IconTrash } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Отчёт по питанию, собранный вручную.
 *
 * Пока своей базы продуктов нет, человек считает КБЖУ в стороннем
 * приложении. Требовать, чтобы он повторно вбивал туда каждую котлету,
 * значит требовать двойной работы — он просто перестанет отчитываться.
 * Поэтому четыре числа и скриншот: ровно то, что у него уже есть.
 *
 * Дневник по продуктам это не отменяет. Если день собран из записей, поля
 * остаются пустыми, и тренер видит посчитанное приложением.
 */
export function ManualNutritionReport({ date }: { date: string }) {
  const { toast, userId } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ kcal: '', protein: '', fat: '', carbs: '' })
  /**
   * За какой день отчёт. По умолчанию открытый в дневнике, но менять
   * можно: считают вечером, а переносят через день-другой, и заставлять
   * ради этого листать дневник назад — лишний шаг.
   */
  const [forDate, setForDate] = useState(date)

  // Строка дня, который сейчас выбран в форме, и строка дня, открытого на
  // экране, — разные: первая нужна форме, вторая подписи под кнопкой.
  const day = useLiveQuery(() => db.nutritionDays.get(`${userId}:${date}`), [userId, date])
  const target = useLiveQuery(
    () => db.nutritionDays.get(`${userId}:${forDate}`),
    [userId, forDate],
  )
  const shotsVersion = useLiveQuery(() => db.attachments.count(), [])
  const shots = useLiveQuery(
    () => nutritionShots(forDate, userId),
    [forDate, userId, shotsVersion],
  )

  // Открывая форму, показываем уже введённое: отчёт правят чаще, чем
  // заполняют с нуля — вечером вспомнили про перекус.
  // Открывая форму, возвращаемся к дню, открытому в дневнике.
  useEffect(() => {
    if (open) setForDate(date)
  }, [open, date])

  // Показываем то, что уже введено за выбранный день: отчёт правят чаще,
  // чем заполняют с нуля, — вечером вспомнили про перекус. И второй отчёт
  // за тот же день завести нельзя: строка дня одна, новая запись её
  // заменяет, а не добавляет вторую.
  useEffect(() => {
    if (!open) return
    const m = target?.manual
    setForm({
      kcal: m?.kcal != null ? String(m.kcal) : '',
      protein: m?.protein != null ? String(m.protein) : '',
      fat: m?.fat != null ? String(m.fat) : '',
      carbs: m?.carbs != null ? String(m.carbs) : '',
    })
  }, [open, forDate, target?.manual])

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  const save = async () => {
    setBusy(true)
    try {
      await setManualNutrition(forDate, {
        kcal: num(form.kcal),
        protein: num(form.protein),
        fat: num(form.fat),
        carbs: num(form.carbs),
      })
      haptics.success()
      // Называем день, если он не тот, что открыт: сохранив отчёт за
      // позавчера, легко решить, что записал за сегодня.
      toast(
        forDate === date
          ? t('Отчёт сохранён')
          : `${t('Отчёт сохранён')} · ${formatDate(new Date(`${forDate}T12:00:00`).getTime())}`,
      )
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const attach = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setBusy(true)
    try {
      for (const file of files) await addNutritionShot({ date: forDate, blob: file, userId })
      haptics.impact()
      toast(t('Скриншот прикреплён'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const manual = day?.manual
  const filled = manual && (manual.kcal || manual.protein || manual.fat || manual.carbs)
  const shotCount = shots?.length ?? 0
  const tm = target?.manual
  const alreadyFilled =
    !!tm && (tm.kcal != null || tm.protein != null || tm.fat != null || tm.carbs != null)
  // Вперёд не пускаем: отчёта за день, который ещё не прошёл, не бывает.
  const today = localDate()

  const field = (key: keyof typeof form, label: string) => (
    <div className="field grow" key={key}>
      <label>{label}</label>
      <input
        className="input"
        inputMode="decimal"
        value={form[key]}
        placeholder="—"
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <>
      <div className="section-title">{t('Отчёт по питанию')}</div>
      <button className="list-item" onClick={() => setOpen(true)}>
        <div className="grow">
          <div className="strong">
            {filled ? t('Изменить отчёт') : t('Прикрепить отчёт по питанию')}
          </div>
          <div className="mute-sm">
            {filled
              ? [
                  manual?.kcal != null && `${manual.kcal} ккал`,
                  manual?.protein != null && `Б ${manual.protein}`,
                  manual?.fat != null && `Ж ${manual.fat}`,
                  manual?.carbs != null && `У ${manual.carbs}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('КБЖУ числом и скриншот из вашего счётчика')}
            {shotCount > 0 && ` · ${shotCount} ${t('скрин.')}`}
          </div>
        </div>
        <IconPlus size={16} />
      </button>

      <Sheet open={open} title={t('Отчёт по питанию')} onClose={() => setOpen(false)}>
        <div className="stack">
          <div className="muted">
            {t('Перенесите итог дня из своего счётчика. Пустое поле останется пустым.')}
          </div>

          <div className="field">
            <label htmlFor="manual-date">{t('За какой день')}</label>
            <input
              id="manual-date"
              className="input"
              type="date"
              value={forDate}
              max={today}
              onChange={(e) => setForDate(e.target.value || date)}
            />
            {/* Отчёт за день один. Выбрав день, за который уже сдавали,
                человек правит тот же отчёт, а не заводит второй — и должен
                понимать это до того, как нажмёт «Сохранить». */}
            {alreadyFilled && (
              <div className="mute-sm mt-1">
                {target?.status === 'submitted'
                  ? t('За этот день отчёт уже сдан — вы его измените.')
                  : t('За этот день уже есть отчёт — вы его измените.')}
              </div>
            )}
          </div>

          <div className="row" style={{ gap: 8 }}>
            {field('kcal', t('Калории'))}
            {field('protein', t('Белки, г'))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {field('fat', t('Жиры, г'))}
            {field('carbs', t('Углеводы, г'))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void attach(e.target.files)}
          />
          <button className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>
            <IconPlus size={16} /> {t('Добавить скриншот')}
          </button>

          {shotCount > 0 && (
            <div className="shot-grid">
              {shots?.map((a) => (
                <ShotThumb attachment={a} key={a.id}>
                  <button
                    className="icon-btn"
                    aria-label={t('Удалить')}
                    onClick={() => deleteAttachment(a.id)}
                  >
                    <IconTrash size={15} />
                  </button>
                </ShotThumb>
              ))}
            </div>
          )}

          <button className="btn primary block" disabled={busy} onClick={save}>
            {busy ? t('Сохраняю…') : t('Сохранить')}
          </button>
        </div>
      </Sheet>
    </>
  )
}
