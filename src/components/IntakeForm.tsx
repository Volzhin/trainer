import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, now, TRAINING_LEVELS, type ClientTask, type TrainingLevel } from '../db/db'
import { saveManualMeasurement } from '../db/repo'
import { completeTask } from '../db/reports'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Стартовая анкета.
 *
 * Часть ответов — не текст, а данные: пол, рост, шея и стаж живут в профиле,
 * вес заводит первую точку статистики. Их спрашивают здесь один раз и больше
 * не переспрашивают, поэтому анкета не просто пишет в задание, а раскладывает
 * ответы по местам, где ими потом пользуются.
 *
 * Остальные вопросы — про человека, а не про цифры: они остаются в анкете и
 * читаются тренером целиком, когда он её открывает.
 */

/** Свободные вопросы. Порядок важен: анкету читают сверху вниз. */
export const INTAKE_QUESTIONS = [
  'Как комфортнее, чтобы к вам обращались? Можно несколько вариантов.',
  'Как удобнее общаться: коротко и по делу или с поддержкой и заботой?',
  'Что может снизить вашу мотивацию?',
  'Если устали и мотивация упала — как вас поддержать? Какими словами?',
  'Какой цели хотите достичь? Как поймёте, что достигли её?',
  'Почему решили обратиться именно ко мне и почему именно сейчас?',
]

/** Вопрос про травмы стоит особняком: его ответ уезжает в карточку клиента. */
export const INJURIES_QUESTION = 'Есть ли травмы, противопоказания, ограничения?'

export function IntakeForm({ task, onDone }: { task: ClientTask; onDone: () => void }) {
  const { toast, userId } = useApp()
  const profile = useLiveQuery(() => db.profile.get(userId), [userId])

  const [gender, setGender] = useState<'м' | 'ж' | ''>('')
  const [birth, setBirth] = useState('')
  const [height, setHeight] = useState('')
  const [neck, setNeck] = useState('')
  const [weight, setWeight] = useState('')
  const [level, setLevel] = useState<TrainingLevel | ''>('')
  const [hasInjuries, setHasInjuries] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Заполненное однажды подставляем: анкету открывают повторно, чтобы
  // дописать, и заставлять вводить рост заново — верный способ получить
  // другое число.
  useEffect(() => {
    if (!profile) return
    setGender(profile.gender ?? '')
    setBirth(profile.birth_date ?? '')
    setHeight(profile.height_cm ? String(profile.height_cm) : '')
    setNeck(profile.neck_cm ? String(profile.neck_cm) : '')
    setLevel(profile.training_level ?? '')
    setHasInjuries(!!profile.limitations)
  }, [profile?.id])

  useEffect(() => {
    setAnswers(task.answers ?? {})
  }, [task.id])

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const answer = (q: string, v: string) => setAnswers((a) => ({ ...a, [q]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const birthYear = birth ? Number(birth.slice(0, 4)) : undefined
      await db.profile.update(userId, {
        gender: gender || undefined,
        birth_date: birth || undefined,
        birth_year: birthYear,
        height_cm: num(height),
        neck_cm: num(neck),
        training_level: level || undefined,
        limitations: hasInjuries ? answers[INJURIES_QUESTION]?.trim() || undefined : undefined,
        updated_at: now(),
      })

      // Вес заводит первую точку графика: без неё динамики нет, а спрашивать
      // его отдельным отчётом сразу после анкеты — просить то же самое дважды.
      const kg = num(weight)
      if (kg) await saveManualMeasurement({ weight_kg: kg }, userId)

      await completeTask(task.id, undefined, {
        ...answers,
        [INJURIES_QUESTION]: hasInjuries ? (answers[INJURIES_QUESTION] ?? '') : t('Нет'),
      })
      haptics.success()
      toast(t('Анкета заполнена'))
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, unit?: string) => (
    <div className="field grow" key={label}>
      <label>{unit ? `${t(label)}, ${t(unit)}` : t(label)}</label>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        placeholder="—"
        onChange={(e) => set(e.target.value)}
      />
    </div>
  )

  return (
    <div className="stack">
      <div className="field">
        <label>{t('Пол')}</label>
        <div className="segmented">
          {(['ж', 'м'] as const).map((v) => (
            <button key={v} className={gender === v ? 'on' : ''} onClick={() => setGender(v)}>
              {v === 'ж' ? t('Женский') : t('Мужской')}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('Дата рождения')}</label>
        <input
          className="input"
          type="date"
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 8 }}>
        {field('Рост', height, setHeight, 'см')}
        {field('Вес', weight, setWeight, 'кг')}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {field('Шея', neck, setNeck, 'см')}
      </div>

      <div className="field">
        <label>{t('Опыт тренировок')}</label>
        <div className="stack">
          {TRAINING_LEVELS.map(({ value, label }) => (
            <button
              key={value}
              className={`btn block${level === value ? ' primary' : ''}`}
              onClick={() => setLevel(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      {/* Травмы — единственный свободный ответ, который уезжает в карточку
          клиента: тренер должен увидеть его до того, как соберёт программу. */}
      <div className="field">
        <label>{t(INJURIES_QUESTION)}</label>
        <div className="segmented">
          <button className={!hasInjuries ? 'on' : ''} onClick={() => setHasInjuries(false)}>
            {t('Нет')}
          </button>
          <button className={hasInjuries ? 'on' : ''} onClick={() => setHasInjuries(true)}>
            {t('Есть, опишу')}
          </button>
        </div>
        {hasInjuries && (
          <textarea
            className="textarea mt-2"
            value={answers[INJURIES_QUESTION] ?? ''}
            onChange={(e) => answer(INJURIES_QUESTION, e.target.value)}
            placeholder={t('Что беспокоит и чего избегать')}
          />
        )}
      </div>

      {INTAKE_QUESTIONS.map((q) => (
        <div className="field" key={q}>
          <label>{t(q)}</label>
          <textarea
            className="textarea"
            value={answers[q] ?? ''}
            onChange={(e) => answer(q, e.target.value)}
          />
        </div>
      ))}

      <button className="btn primary block" disabled={busy} onClick={save}>
        {t('Отправить анкету')}
      </button>
    </div>
  )
}
