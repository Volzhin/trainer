import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contact, type ContactKind } from '../../db/db'
import { isAuthed, updateAccount } from '../../lib/backend'
import { ContactEditor } from '../../components/ContactLinks'
import { AccountSection } from '../../components/AccountSection'
import { Sheet } from '../../components/Sheet'
import { AccountSwitcher } from '../../components/AccountSwitcher'
import { useApp, useProfile } from '../../store/app'
import { plural } from '../../lib/calc'
import { seedTrainerDemo } from '../../db/demo'
import { haptics } from '../../lib/native'

export function TrainerProfile() {
  const { toast, userId, online } = useApp()
  const profile = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

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

  const loadDemo = async () => {
    setDemoBusy(true)
    try {
      const res = await seedTrainerDemo(userId)
      haptics.success()
      toast(
        `Добавлено ${res.clients} ${plural(res.clients, ['клиент', 'клиента', 'клиентов'])}`,
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось создать демо-клиентов')
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Профиль</h1>
          <div className="sub">Кабинет тренера</div>
        </div>
        <span className="badge pro">ТРЕНЕР</span>
      </div>

      <div className="card">
        <div className="row">
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
            {(profile?.name ?? 'Т').slice(0, 1)}
          </div>
          <div className="grow">
            <div className="strong">{profile?.name}</div>
            <div className="mute-sm">
              {profile?.specialization ?? 'Специализация не указана'}
            </div>
          </div>
          <button className="btn sm" onClick={() => setEditOpen(true)}>
            Изменить
          </button>
        </div>
        {profile?.bio && (
          <div className="muted" style={{ marginTop: 10 }}>
            {profile.bio}
          </div>
        )}
      </div>

      <div className="section-title">Практика</div>
      <div className="card stack">
        <div className="row between">
          <span className="muted">Клиентов</span>
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
        {/* Не «режим»: этим словом теперь называется формат работы с
            клиентом — очно или онлайн. Здесь речь про сеть. */}
        <div className="row between">
          <span className="muted">Связь</span>
          <strong>{online ? 'есть' : 'нет сети'}</strong>
        </div>
      </div>

      <div className="section-title">Аккаунты</div>
      <div className="card stack">
        <div className="muted">
          Прототип держит несколько аккаунтов в одной базе, чтобы можно было посмотреть на
          связку с обеих сторон.
        </div>
        <button className="btn block" onClick={() => setAccountsOpen(true)}>
          Переключить аккаунт
        </button>
        <button className="btn block" disabled={demoBusy} onClick={loadDemo}>
          {demoBusy ? 'Создаю…' : 'Добавить демо-клиентов'}
        </button>
      </div>

      <AccountSection />

      <div className="mute-sm" style={{ textAlign: 'center', marginTop: 20 }}>
        Прототип v0.2 · кабинет тренера
      </div>

      <Sheet open={editOpen} title="Профиль тренера" onClose={() => setEditOpen(false)}>
        <TrainerForm onDone={() => setEditOpen(false)} />
      </Sheet>

      <AccountSwitcher open={accountsOpen} onClose={() => setAccountsOpen(false)} />
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
      <div className="mute-sm" style={{ marginBottom: 10 }}>
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
