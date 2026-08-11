import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, currentUserId, type Contact, type ContactKind } from '../db/db'
import { ContactEditor } from '../components/ContactLinks'
import { Sheet } from '../components/Sheet'
import { IconSettings } from '../components/Icons'
import { useProfile } from '../store/app'
import { MyTrainerCard } from '../components/MyTrainerCard'
import { Group, Row } from '../components/Group'

export function Profile() {
  const nav = useNavigate()
  const profile = useProfile()
  const [editOpen, setEditOpen] = useState(false)









  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Профиль</h1>
          <div className="sub">{profile?.name ?? 'Гость'}</div>
        </div>
        <button className="icon-btn" onClick={() => nav('/settings')} aria-label="Настройки">
          <IconSettings size={18} />
        </button>
      </div>

      <Group>
        <Row
          icon={(profile?.name ?? 'Г').slice(0, 1)}
          title={profile?.name ?? 'Гость'}
          sub={`${profile?.experience ?? 'Опыт не указан'}${
            profile?.height_cm ? ` · ${profile.height_cm} см` : ''
          }`}
          onClick={() => setEditOpen(true)}
          chevron
        />
      </Group>

      <MyTrainerCard />


      <Group title="Мои данные">
        <Row
          title="История тренировок"
          sub="Все завершённые тренировки"
          onClick={() => nav('/history')}
          chevron
        />
        <Row
          title="Анализ тела"
          sub="Замеры и отчёты InBody"
          onClick={() => nav('/body')}
          chevron
        />
        <Row
          title="Прогресс"
          sub="План программы, рост весов по упражнениям, рекорды"
          onClick={() => nav('/progress')}
          chevron
        />
      </Group>



      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />

    </div>
  )
}


function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState('')
  const [height, setHeight] = useState('')
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState('Новичок')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [preferred, setPreferred] = useState<ContactKind | undefined>()
  const [loaded, setLoaded] = useState(false)

  if (profile && !loaded) {
    setContacts(profile.contacts ?? [])
    setPreferred(profile.preferred_contact)
    setLoaded(true)
  }

  const submit = async () => {
    await db.profile.update(currentUserId(), {
      name: name.trim() || profile?.name || 'Гость',
      height_cm: height ? Number(height) : profile?.height_cm,
      goal_weight_kg: goal ? Number(goal) : profile?.goal_weight_kg,
      experience: experience as never,
      contacts,
      preferred_contact: preferred,
      updated_at: Date.now(),
    })
    onClose()
  }

  return (
    <Sheet open={open} title="Профиль" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Имя</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={profile?.name ?? 'Гость'}
          />
        </div>
        <div className="field">
          <label>Рост, см</label>
          <input
            className="input"
            inputMode="numeric"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder={profile?.height_cm?.toString() ?? '180'}
          />
        </div>
        <div className="field">
          <label>Целевой вес, кг</label>
          <input
            className="input"
            inputMode="decimal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={profile?.goal_weight_kg?.toString() ?? '75'}
          />
        </div>
        <div className="field">
          <label>Опыт тренировок</label>
          <select
            className="select"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
          >
            {['Новичок', 'Средний', 'Продвинутый'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="divider" />
        <div className="field-group-title">Где с вами связаться</div>
        <div className="mute-sm mb-3">
          Тренер напишет вам туда, где вам удобно отвечать.
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
    </Sheet>
  )
}
