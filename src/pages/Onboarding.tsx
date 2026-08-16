import { useState } from 'react'
import { markOnboarded, type Role } from '../db/db'
import { createAccount } from '../db/coach'
import { haptics } from '../lib/native'
import {
  IconChat,
  IconCloudOff,
  IconClipboard,
  IconDumbbell,
  IconMuscle,
  IconTeacher,
  IconTrend,
  IconUsers,
  IconZap,
} from '../components/Icons'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

/**
 * Первый запуск: кто вы → что умеет приложение → с чего начать.
 * Три коротких шага вместо тура по всем экранам — пользователь быстрее
 * доходит до работы, а объяснения остаются доступны в профиле.
 */

type Props = { onDone: () => void }

type Point = [(p: { size?: number }) => JSX.Element, string, string]

const CLIENT_POINTS: Point[] = [
  [
    IconZap,
    'Логирование в два касания',
    'Вес и повторения подставляются из прошлой тренировки — вспоминать ничего не нужно.',
  ],
  [
    IconCloudOff,
    'Работает без интернета',
    'В подвальном зале приложение открывается и пишет данные как обычно.',
  ],
  [
    IconTrend,
    'Прогресс виден сразу',
    'Тоннаж, рекорды и расчётный максимум считаются автоматически.',
  ],
]

const TRAINER_POINTS: Point[] = [
  [
    IconUsers,
    'Все клиенты на одном экране',
    'Сразу видно, кто выпал из графика, а кто выполняет план.',
  ],
  [
    IconClipboard,
    'Программы по коду',
    'Выпускаете код, клиент вводит его — и получает вашу программу.',
  ],
  [
    IconChat,
    'Обратная связь по тренировке',
    'Комментарий прилетает клиенту прямо в карточку тренировки.',
  ],
]

export function Onboarding({ onDone }: Props) {
  const { switchTo } = useApp()
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)

  const points = role === 'TRAINER' ? TRAINER_POINTS : CLIENT_POINTS

  const finish = async () => {
    setBusy(true)
    try {
      if (role === 'TRAINER') {
        // Тренеру нужен отдельный аккаунт: стартовый профиль — клиентский.
        const trainerId = await createAccount({ name: 'Тренер', role: 'TRAINER' })
        await switchTo(trainerId)
      }
      await markOnboarded()
      haptics.success()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  /**
   * Пропуск снимает только необязательные шаги. Выбранную роль он обязан
   * применить: иначе человек, отметивший «я тренер», молча оказывается в
   * клиентском приложении и не понимает, куда делся кабинет.
   */
  const skip = async () => {
    if (role === 'TRAINER') {
      const trainerId = await createAccount({ name: 'Тренер', role: 'TRAINER' })
      await switchTo(trainerId)
    }
    await markOnboarded()
    onDone()
  }

  return (
    <div className="onboard">
      <div className="steps">
        {[0, 1].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <div className="body">
          <div className="glyph">
            <IconDumbbell size={44} />
          </div>
          <h2>{t('Как вы будете пользоваться приложением?')}</h2>
          <p className="mb-6">
            {t('От этого зависят экраны — их можно переключить позже в профиле.')}
          </p>
          <div className="actions">
            <button
              className={`pick${role === 'CLIENT' ? ' on' : ''}`}
              onClick={() => {
                haptics.selection()
                setRole('CLIENT')
              }}
            >
              <span className="ico">
                <IconMuscle size={22} />
              </span>
              <span className="grow">
                <span className="strong" style={{ display: 'block' }}>{t('Я тренируюсь')}</span>
                <span className="mute-sm">{t('Дневник тренировок, программы и прогресс')}</span>
              </span>
            </button>
            <button
              className={`pick${role === 'TRAINER' ? ' on' : ''}`}
              onClick={() => {
                haptics.selection()
                setRole('TRAINER')
              }}
            >
              <span className="ico">
                <IconTeacher size={22} />
              </span>
              <span className="grow">
                <span className="strong" style={{ display: 'block' }}>{t('Я тренер')}</span>
                <span className="mute-sm">{t('Кабинет с клиентами, программы и обратная связь')}</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="body">
          <h2>{t('Что вы получаете')}</h2>
          <div className="stack" style={{ marginTop: 24, gap: 18 }}>
            {points.map(([Glyph, title, text]) => (
              <div className="row" key={title} style={{ alignItems: 'flex-start' }}>
                <span className="metric-icon" style={{ color: 'var(--accent)' }}>
                  <Glyph size={20} />
                </span>
                <span className="grow">
                  <span className="strong" style={{ display: 'block' }}>{t(title)}</span>
                  <span className="muted">{t(text)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="actions">
        {step < 1 ? (
          <>
            <button
              className="btn primary block"
              disabled={step === 0 && !role}
              onClick={() => {
                haptics.impact()
                setStep(step + 1)
              }}
            >
              {t('Далее')}
            </button>
            <button className="btn ghost block" onClick={skip}>
              {t('Пропустить')}
            </button>
          </>
        ) : (
          <button className="btn primary block" disabled={busy} onClick={finish}>
            {busy ? t('Секунду…') : t('Начать')}
          </button>
        )}
      </div>
    </div>
  )
}
