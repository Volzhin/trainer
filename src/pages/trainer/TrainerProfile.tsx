import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contact, type ContactKind } from '../../db/db'
import { isAuthed, updateAccount } from '../../lib/backend'
import { ContactEditor } from '../../components/ContactLinks'
import { Sheet } from '../../components/Sheet'
import { haptics } from '../../lib/native'
import { IconSettings } from '../../components/Icons'
import { useApp, useProfile } from '../../store/app'
import { t } from '../../lib/i18n'

export function TrainerProfile() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const profile = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const isPro = profile?.plan === 'PRO'

  const togglePlan = async () => {
    await db.profile.update(userId, {
      plan: isPro ? 'FREE' : 'PRO',
      updated_at: Date.now(),
    })
    haptics.success()
    toast(isPro ? 'Подписка отключена' : 'Подписка активна')
    setPayOpen(false)
  }

  const counts = useLiveQuery(async () => {
    const clients = await db.links.where('trainer_id').equals(userId).count()
    const programs = await db.programs.where('author_id').equals(userId).count()
    const assignments = await db.assignments
      .where('trainer_id')
      .equals(userId)
      .and((a) => a.status === 'ACTIVE')
      .count()
    return { clients, programs, assignments }
  }, [userId])


  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Профиль')}</h1>
          <div className="sub">{t('Кабинет тренера')}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge pro">ТРЕНЕР</span>
          <button
            className="icon-btn"
            onClick={() => nav('/settings')}
            aria-label={t('Настройки')}
          >
            <IconSettings size={18} />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
            {(profile?.name ?? 'Т').slice(0, 1)}
          </div>
          <div className="grow">
            <div className="strong">{profile?.name}</div>
            <div className="mute-sm">
              {profile?.specialization ?? t('Специализация не указана')}
            </div>
          </div>
          <button className="btn sm" onClick={() => setEditOpen(true)}>
            {t('Изменить')}
          </button>
        </div>
        {profile?.bio && (
          <div className="muted mt-3">
            {profile.bio}
          </div>
        )}
      </div>

      {/* Подписка — единственное платное в приложении, и платит её тот, кто
          на нём зарабатывает. Состояние показано всегда, а не только когда
          что-то упёрлось: тренер должен знать, что подписка кончилась, до
          того, как не сможет позвать клиента. */}
      <div className="section-title">{t('Подписка')}</div>
      <div className={`card${isPro ? '' : ' mt-0'}`} style={isPro ? undefined : { borderColor: 'var(--accent)' }}>
        {isPro ? (
          <>
            <div className="row between">
              <div className="grow">
                <div className="strong">{t('Подписка активна')}</div>
                <div className="mute-sm mt-1">
                  Набор клиентов, ведение и назначение программ — без ограничений.
                </div>
              </div>
              <span className="badge pro">PRO</span>
            </div>
            <button className="btn ghost danger block mt-3" onClick={togglePlan}>
              {t('Отключить подписку')}
            </button>
          </>
        ) : (
          <>
            <div className="strong">{t('Подписка не оформлена')}</div>
            <div className="mute-sm mt-1">
              Без неё нельзя выпускать коды приглашения, назначать программы и собирать
              персональные планы. Уже набранные клиенты и их история остаются на месте —
              вы просто не сможете добавлять новых и менять назначения.
            </div>
            <button className="btn primary block mt-3" onClick={() => setPayOpen(true)}>
              Оформить за 499 ₽ в месяц
            </button>
          </>
        )}
      </div>

      <div className="section-title">{t('Практика')}</div>
      <div className="card stack">
        <div className="row between">
          <span className="muted">{t('клиентов')}</span>
          <strong>{counts?.clients ?? 0}</strong>
        </div>
        <div className="row between">
          <span className="muted">Активных назначений</span>
          <strong>{counts?.assignments ?? 0}</strong>
        </div>
        <div className="row between">
          <span className="muted">Своих программ</span>
          <strong>{counts?.programs ?? 0}</strong>
        </div>
      </div>


      <Sheet open={editOpen} title="Профиль тренера" onClose={() => setEditOpen(false)}>
        <TrainerForm onDone={() => setEditOpen(false)} />
      </Sheet>

      <Sheet open={payOpen} title="Подписка тренера" onClose={() => setPayOpen(false)}>
        <div className="stack">
          <div className="card">
            <div className="row between">
              <span>Месяц</span>
              <strong>499 ₽</strong>
            </div>
            <div className="row between mt-2">
              <span>
                Год <span className="badge">−40%</span>
              </span>
              <strong>3 590 ₽</strong>
            </div>
          </div>
          <div className="muted">
            Клиентам приложение бесплатно целиком — они ничего не оплачивают и ни во что не
            упираются.
          </div>
          <button className="btn primary block" onClick={togglePlan}>
            Оплатить через СБП
          </button>
          <button className="btn block" onClick={togglePlan}>
            Банковской картой (ЮKassa)
          </button>
          <div className="mute-sm text-center">
            В прототипе оплата эмулируется и просто включает подписку. В проде права выдаёт
            эквайер по вебхуку.
          </div>
        </div>
      </Sheet>

    </div>
  )
}

function TrainerForm({ onDone }: { onDone: () => void }) {
  const { userId } = useApp()
  const profile = useProfile()
  const [name, setName] = useState('')
  const [spec, setSpec] = useState('')
  const [bio, setBio] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [preferred, setPreferred] = useState<ContactKind | undefined>()
  const [loaded, setLoaded] = useState(false)

  // Контакты подтягиваются один раз: дальше форма — источник правды.
  if (profile && !loaded) {
    setContacts(profile.contacts ?? [])
    setPreferred(profile.preferred_contact)
    setLoaded(true)
  }

  const submit = async () => {
    await db.profile.update(userId, {
      name: name.trim() || profile?.name || 'Тренер',
      specialization: spec.trim() || profile?.specialization,
      bio: bio.trim() || profile?.bio,
      contacts,
      preferred_contact: preferred,
      updated_at: Date.now(),
    })

    // Контакты дублируются в аккаунт: только оттуда их может прочитать
    // клиент — доступа к записям тренера у него нет и быть не должно.
    if (isAuthed()) {
      await updateAccount({
        name: name.trim() || profile?.name,
        contacts,
        preferred_contact: preferred,
      }).catch(() => {})
    }
    onDone()
  }

  return (
    <div className="stack">
      <div className="field">
        <label>Имя</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={profile?.name}
        />
      </div>
      <div className="field">
        <label>Специализация</label>
        <input
          className="input"
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder={profile?.specialization ?? 'Силовой тренинг'}
        />
      </div>
      <div className="field">
        <label>О себе</label>
        <textarea
          className="textarea"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={profile?.bio ?? 'Опыт, образование, подход к работе'}
        />
      </div>
      <div className="divider" />
      <div className="field-group-title">Где с вами связаться</div>
      <div className="mute-sm mb-3">
        Клиент увидит эти ссылки в карточке тренера и напишет вам в один тап.
      </div>
      <ContactEditor
        contacts={contacts}
        preferred={preferred}
        onChange={(next, pref) => {
          setContacts(next)
          setPreferred(pref)
        }}
      />

      <button className="btn primary block" onClick={submit}>
        Сохранить
      </button>
    </div>
  )
}
