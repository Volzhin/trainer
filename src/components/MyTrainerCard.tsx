import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Consent } from '../db/db'
import { redeemInvite, removeLink, trainerOfClient } from '../db/coach'
import { ContactLinks } from './ContactLinks'
import { ConsentStep } from './ConsentStep'
import { Sheet } from './Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/** Блок «Мой тренер» в профиле клиента: привязка по коду и отвязка. */
export function MyTrainerCard() {
  const { toast, userId } = useApp()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // Код и подписи — два шага одной формы: сначала человек доказывает, что
  // его позвали, потом соглашается с условиями. Обратный порядок заставлял
  // бы читать документы тех, кто ошибся кодом.
  const [step, setStep] = useState<'code' | 'consent'>('code')

  const linkVersion = useLiveQuery(() => db.links.count(), [])
  const bond = useLiveQuery(() => trainerOfClient(userId), [userId, linkVersion])

  const submit = async (consents: Consent[]) => {
    setBusy(true)
    try {
      const name = await redeemInvite(code, userId, consents)
      haptics.success()
      toast(`Тренер ${name} подключён`)
      close()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось подключить тренера')
    } finally {
      setBusy(false)
    }
  }

  /** Закрытие всегда возвращает форму в начало: код одноразовый. */
  const close = () => {
    setOpen(false)
    setCode('')
    setStep('code')
  }

  const unlink = async () => {
    if (!bond) return
    await removeLink(bond.link.id)
    toast('Тренер отключён')
  }

  return (
    <>
      <div className="section-title">{t('Тренер')}</div>
      <div className="card">
        {bond ? (
          <>
            <div className="row">
              <div className="avatar">{bond.trainer.name.slice(0, 1)}</div>
              <div className="grow">
                <div className="strong">{bond.trainer.name}</div>
                <div className="mute-sm">
                  {bond.trainer.specialization ?? 'Персональный тренер'}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ContactLinks
                profile={bond.trainer}
                title={t('Написать')}
                emptyHint="Тренер ещё не указал, где с ним связаться."
              />
            </div>
            <div className="mute-sm mt-3">
              Тренер видит вашу историю тренировок, прогресс и замеры тела. Личные настройки
              приложения и другие тренеры ему недоступны.
            </div>
            <button
              className="btn ghost danger block mt-3"
              onClick={unlink}
            >
              Отключить тренера
            </button>
          </>
        ) : (
          <>
            <div className="muted">
              Есть код от тренера? Введите его — тренер сможет назначать вам программы и
              комментировать тренировки.
            </div>
            <button
              className="btn primary block mt-3"
              onClick={() => setOpen(true)}
            >
              Ввести код тренера
            </button>
          </>
        )}
      </div>

      <Sheet
        open={open}
        title={step === 'code' ? 'Код тренера' : 'Условия работы'}
        onClose={close}
      >
        {step === 'code' ? (
          <div className="stack">
            <div className="field">
              <label>{t('Код приглашения')}</label>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                autoFocus
                style={{ letterSpacing: 4, fontWeight: 700, textAlign: 'center', fontSize: 22 }}
              />
            </div>
            <button
              className="btn primary block"
              disabled={code.length < 6}
              onClick={() => setStep('consent')}
            >
              Далее
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              Подключая тренера, вы открываете ему доступ к своей истории тренировок.
            </div>
          </div>
        ) : (
          <ConsentStep busy={busy} onBack={() => setStep('code')} onAccept={submit} />
        )}
      </Sheet>
    </>
  )
}
