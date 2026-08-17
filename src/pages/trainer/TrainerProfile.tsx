import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contact, type ContactKind } from '../../db/db'
import { isAuthed, updateAccount } from '../../lib/backend'
import { ContactEditor } from '../../components/ContactLinks'
import { Sheet } from '../../components/Sheet'
import { haptics } from '../../lib/native'
import { IconSettings } from '../../components/Icons'
import { TrainerDocs } from '../../components/TrainerDocs'
import {
  AchievementsGrid,
  NewAchievementCard,
  TotalsCard,
  TrainerWeekCard,
  YearStrip,
  useTrainerGame,
} from '../../components/Game'
import { useApp, useProfile } from '../../store/app'
import { t } from '../../lib/i18n'

export function TrainerProfile() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const profile = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const game = useTrainerGame(userId)

  const isPro = profile?.plan === 'PRO'

  const togglePlan = async () => {
    await db.profile.update(userId, {
      plan: isPro ? 'FREE' : 'PRO',
      updated_at: Date.now(),
    })
    haptics.success()
    toast(isPro ? t('Подписка отключена') : t('Подписка активна'))
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
          <span className="badge pro">{t('ТРЕНЕР')}</span>
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
                  {t('Набор клиентов, ведение и назначение программ — без ограничений.')}
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
              {t('Без неё нельзя выпускать коды приглашения, назначать программы и собирать персональные планы. Уже набранные клиенты и их история остаются на месте — вы просто не сможете добавлять новых и менять назначения.')}
            </div>
            <button className="btn primary block mt-3" onClick={() => setPayOpen(true)}>
              {t('Оформить за 499 ₽ в месяц')}
            </button>
          </>
        )}
      </div>

      {/* Счёт работы тренера — то же, что у клиента, но на языке его дела:
          не «сколько я потренировался», а «сколько разобрал, сколько должен
          и как быстро отвечаю». Очков нет: тренер работает, а не играет. */}
      {game && (
        <>
          <NewAchievementCard achievements={game.achievements} userId={userId} />
          <div className="section-title">{t('Эта неделя')}</div>
          <TrainerWeekCard game={game} />

          {/* Три числа вместо прежней «ступени»: «Практика» и «Школа» не
              говорили тренеру ни сколько он сделал, ни сколько до следующей. */}
          <div className="section-title">{t('Всего')}</div>
          <TotalsCard
            items={[
              { value: game.totals.reviews, forms: ['разбор', 'разбора', 'разборов'] },
              { value: game.totals.clients, forms: ['клиент', 'клиента', 'клиентов'] },
              { value: game.totals.weeks, forms: ['неделя практики', 'недели практики', 'недель практики'] },
            ]}
          />

          <div className="section-title">{t('Год одной строкой')}</div>
          <div className="card">
            <YearStrip year={game.year} />
            <div className="mute-sm mt-2">
              {t('Столбик — неделя, высота — сколько разборов. Пустая неделя ничем не окрашена: значит, разбирать было нечего.')}
            </div>
          </div>

          <div className="section-title">{t('Достижения')}</div>
          <AchievementsGrid achievements={game.achievements} />
        </>
      )}

      <div className="section-title">{t('Практика')}</div>
      <div className="card stack">
        <div className="row between">
          <span className="muted">{t('клиентов')}</span>
          <strong>{counts?.clients ?? 0}</strong>
        </div>
        <div className="row between">
          <span className="muted">{t('Активных назначений')}</span>
          <strong>{counts?.assignments ?? 0}</strong>
        </div>
        <div className="row between">
          <span className="muted">{t('Своих программ')}</span>
          <strong>{counts?.programs ?? 0}</strong>
        </div>
      </div>

      <TrainerDocs />


      <Sheet open={editOpen} title={t('Профиль тренера')} onClose={() => setEditOpen(false)}>
        <TrainerForm onDone={() => setEditOpen(false)} />
      </Sheet>

      <Sheet open={payOpen} title={t('Подписка тренера')} onClose={() => setPayOpen(false)}>
        <div className="stack">
          <div className="card">
            <div className="row between">
              <span>{t('Месяц')}</span>
              <strong>499 ₽</strong>
            </div>
            <div className="row between mt-2">
              <span>
                {t('Год')} <span className="badge">−40%</span>
              </span>
              <strong>3 590 ₽</strong>
            </div>
          </div>
          <div className="muted">
            {t('Клиентам приложение бесплатно целиком — они ничего не оплачивают и ни во что не упираются.')}
          </div>
          <button className="btn primary block" onClick={togglePlan}>
            {t('Оплатить через СБП')}
          </button>
          <button className="btn block" onClick={togglePlan}>
            {t('Банковской картой (ЮKassa)')}
          </button>
          <div className="mute-sm text-center">
            {t('В прототипе оплата эмулируется и просто включает подписку. В проде права выдаёт эквайер по вебхуку.')}
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
        <label>{t('Имя')}</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={profile?.name}
        />
      </div>
      <div className="field">
        <label>{t('Специализация')}</label>
        <input
          className="input"
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder={profile?.specialization ?? t('Силовой тренинг')}
        />
      </div>
      <div className="field">
        <label>{t('О себе')}</label>
        <textarea
          className="textarea"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={profile?.bio ?? t('Опыт, образование, подход к работе')}
        />
      </div>
      <div className="divider" />
      <div className="field-group-title">{t('Где с вами связаться')}</div>
      <div className="mute-sm mb-3">
        {t('Клиент увидит эти ссылки в карточке тренера и напишет вам в один тап.')}
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
        {t('Сохранить')}
      </button>
    </div>
  )
}
