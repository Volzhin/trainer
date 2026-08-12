import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Consent } from '../db/db'
import { redeemInvite, removeLink, trainerOfClient } from '../db/coach'
import { ContactLinks } from './ContactLinks'
import { ConsentStep } from './ConsentStep'
import { peekInvite, type TrainerDoc } from '../lib/backend'
import { BarcodeScanner, QR_FORMATS } from './BarcodeScanner'
import { IconCamera } from './Icons'
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
  /** Документы тренера, полученные по коду до привязки. */
  const [docs, setDocs] = useState<TrainerDoc[]>([])
  const [checking, setChecking] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)


  const linkVersion = useLiveQuery(() => db.links.count(), [])
  const bond = useLiveQuery(() => trainerOfClient(userId), [userId, linkVersion])

  /*
   * Код из ссылки QR. Тренер показывает код с адресом, клиент наводит
   * камеру телефона и попадает сюда с уже подставленным кодом — вводить
   * шесть символов с чужого экрана не приходится.
   *
   * Параметр из адреса убираем сразу: перезагрузив страницу через неделю,
   * человек не должен снова увидеть форму привязки к тренеру, от которого
   * давно ушёл.
   */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const fromLink = params.get('join')?.trim().toUpperCase()
    if (!fromLink) return

    // Параметр вычищаем сразу, даже если форму не открыли: он одноразовый,
    // и оставлять его в адресе значит показывать ту же форму при каждой
    // перезагрузке.
    params.delete('join')
    const rest = params.toString()
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)

    // Связка ещё читается — undefined. Ждём: открыть форму привязки тому,
    // у кого тренер уже есть, значит предложить сделать невозможное, а
    // ошибку он увидит только после подписания документов.
    if (bond === undefined) return
    if (bond) {
      toast(t('Вы уже работаете с тренером'))
      return
    }
    setCode(fromLink)
    setOpen(true)
  }, [bond])

  const submit = async (consents: Consent[]) => {
    setBusy(true)
    try {
      const name = await redeemInvite(code, userId, consents)
      haptics.success()
      toast(`${t('Тренер')} ${name} ${t('подключён')}`)
      close()
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t('Не удалось подключить тренера'))
    } finally {
      setBusy(false)
    }
  }

  /** Закрытие всегда возвращает форму в начало: код одноразовый. */
  const close = () => {
    setOpen(false)
    setCode('')
    setStep('code')
    setDocs([])
  }

  const unlink = async () => {
    if (!bond) return
    await removeLink(bond.link.id)
    toast(t('Тренер отключён'))
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
                  {bond.trainer.specialization ?? t('Персональный тренер')}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ContactLinks
                profile={bond.trainer}
                title={t('Написать')}
                emptyHint={t('Тренер ещё не указал, где с ним связаться.')}
              />
            </div>
            <div className="mute-sm mt-3">
              {t('Тренер видит вашу историю тренировок, прогресс и замеры тела. Личные настройки приложения и другие тренеры ему недоступны.')}
            </div>
            <button
              className="btn ghost danger block mt-3"
              onClick={unlink}
            >
              {t('Отключить тренера')}
            </button>
          </>
        ) : (
          <>
            <div className="muted">
              {t('Есть код от тренера? Введите его — тренер сможет назначать вам программы и комментировать тренировки.')}
            </div>
            <button
              className="btn primary block mt-3"
              onClick={() => setOpen(true)}
            >
              {t('Ввести код тренера')}
            </button>
          </>
        )}
      </div>

      <Sheet
        open={open}
        title={step === 'code' ? t('Код тренера') : t('Условия работы')}
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
              disabled={code.length < 6 || checking}
              onClick={async () => {
                // Сначала спрашиваем, к кому ведёт код и что подписывать.
                // Код при этом не гасится: передумавший не должен остаться
                // без кода и без тренера.
                setChecking(true)
                try {
                  const res = await peekInvite(code)
                  setDocs(res.documents ?? [])
                  setStep('consent')
                } catch (e) {
                  toast(e instanceof Error ? t(e.message) : t('Код не найден'))
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking ? t('Проверяю…') : t('Далее')}
            </button>
            {/* Сканер — рядом с полем, а не вместо него: камера есть не у
                всех браузеров, и путь руками должен оставаться на виду. */}
            <button className="btn block" onClick={() => setScanOpen(true)}>
              <IconCamera size={16} /> {t('Сканировать QR')}
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              {t('Подключая тренера, вы открываете ему доступ к своей истории тренировок.')}
            </div>
          </div>
        ) : (
          <ConsentStep
            documents={docs}
            busy={busy}
            onBack={() => setStep('code')}
            onAccept={submit}
          />
        )}
      </Sheet>

      <BarcodeScanner
        open={scanOpen}
        formats={QR_FORMATS}
        title={t('Сканировать QR')}
        hint={t('Или введите код руками')}
        onClose={() => setScanOpen(false)}
        onDetected={(raw) => {
          setCode(codeFromScan(raw))
          setScanOpen(false)
        }}
      />
    </>
  )
}

/**
 * Что делать с прочитанным кодом.
 *
 * В QR лежит ссылка, но человек может отсканировать и голый код — или
 * ввести его руками в том же поле сканера. Достаём шесть символов из
 * любого варианта, а не требуем угадать нужный.
 */
function codeFromScan(raw: string): string {
  const text = raw.trim()
  try {
    const join = new URL(text).searchParams.get('join')
    if (join) return join.trim().toUpperCase()
  } catch {
    /* не ссылка — значит сам код */
  }
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}
