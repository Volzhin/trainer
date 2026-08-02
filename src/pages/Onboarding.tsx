import { useState } from 'react'
import { markOnboarded, type Role } from '../db/db'
import { createAccount } from '../db/coach'
import { generateDemoData, seedTrainerDemo } from '../db/demo'
import { haptics } from '../lib/native'
import { useApp } from '../store/app'

/**
 * Первый запуск: кто вы → что умеет приложение → с чего начать.
 * Три коротких шага вместо тура по всем экранам — пользователь быстрее
 * доходит до работы, а объяснения остаются доступны в профиле.
 */

type Props = { onDone: () => void }

const CLIENT_POINTS = [
  ['⚡', 'Логирование в два касания', 'Вес и повторения подставляются из прошлой тренировки — вспоминать ничего не нужно.'],
  ['📶', 'Работает без интернета', 'В подвальном зале приложение открывается и пишет данные как обычно.'],
  ['📈', 'Прогресс виден сразу', 'Тоннаж, рекорды и расчётный максимум считаются автоматически.'],
]

const TRAINER_POINTS = [
  ['👥', 'Все клиенты на одном экране', 'Сразу видно, кто выпал из графика, а кто выполняет план.'],
  ['📋', 'Программы по коду', 'Выпускаете код, клиент вводит его — и получает вашу программу.'],
  ['💬', 'Обратная связь по тренировке', 'Комментарий прилетает клиенту прямо в карточку тренировки.'],
]

export function Onboarding({ onDone }: Props) {
  const { userId, switchTo } = useApp()
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)

  const points = role === 'TRAINER' ? TRAINER_POINTS : CLIENT_POINTS

  const finish = async (withDemo: boolean) => {
    setBusy(true)
    try {
      if (role === 'TRAINER') {
        // Тренеру нужен отдельный аккаунт: стартовый профиль — клиентский.
        const trainerId = await createAccount({ name: 'Тренер', role: 'TRAINER' })
        if (withDemo) await seedTrainerDemo(trainerId)
        await switchTo(trainerId)
      } else if (withDemo) {
        await generateDemoData(userId)
      }
      await markOnboarded()
      haptics.success()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    await markOnboarded()
    onDone()
  }

  return (
    <div className="onboard">
      <div className="steps">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <div className="body">
          <div className="glyph">🏋️</div>
          <h2>Как вы будете пользоваться приложением?</h2>
          <p style={{ marginBottom: 24 }}>
            От этого зависят экраны — их можно переключить позже в профиле.
          </p>
          <div className="actions">
            <button
              className={`pick${role === 'CLIENT' ? ' on' : ''}`}
              onClick={() => {
                haptics.selection()
                setRole('CLIENT')
              }}
            >
              <span className="ico">💪</span>
              <span className="grow">
                <span style={{ fontWeight: 600, display: 'block' }}>Я тренируюсь</span>
                <span className="mute-sm">Дневник тренировок, программы и прогресс</span>
              </span>
            </button>
            <button
              className={`pick${role === 'TRAINER' ? ' on' : ''}`}
              onClick={() => {
                haptics.selection()
                setRole('TRAINER')
              }}
            >
              <span className="ico">🧑‍🏫</span>
              <span className="grow">
                <span style={{ fontWeight: 600, display: 'block' }}>Я тренер</span>
                <span className="mute-sm">Кабинет с клиентами, программы и обратная связь</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="body">
          <h2>{role === 'TRAINER' ? 'Что вы получаете' : 'Что вы получаете'}</h2>
          <div className="stack" style={{ marginTop: 22, gap: 18 }}>
            {points.map(([glyph, title, text]) => (
              <div className="row" key={title} style={{ alignItems: 'flex-start' }}>
                <span style={{ fontSize: 24, lineHeight: 1.2 }}>{glyph}</span>
                <span className="grow">
                  <span style={{ fontWeight: 600, display: 'block' }}>{title}</span>
                  <span className="muted">{text}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="body">
          <div className="glyph">🎬</div>
          <h2>Показать на примере?</h2>
          <p>
            {role === 'TRAINER'
              ? 'Добавим пятерых клиентов с готовой историей — кабинет сразу будет живым, и вы увидите, как он работает. Демо-данные можно удалить в любой момент.'
              : 'Заполним дневник историей за 10 недель — графики и рекорды сразу будут на месте. Демо-данные можно удалить в любой момент.'}
          </p>
        </div>
      )}

      <div className="actions">
        {step < 2 ? (
          <>
            <button
              className="btn primary block"
              disabled={step === 0 && !role}
              onClick={() => {
                haptics.impact()
                setStep(step + 1)
              }}
            >
              Далее
            </button>
            <button className="btn ghost block" onClick={skip}>
              Пропустить
            </button>
          </>
        ) : (
          <>
            <button className="btn primary block" disabled={busy} onClick={() => finish(true)}>
              {busy ? 'Готовлю…' : 'Да, с демо-данными'}
            </button>
            <button className="btn block" disabled={busy} onClick={() => finish(false)}>
              Начать с чистого листа
            </button>
          </>
        )}
      </div>
    </div>
  )
}
