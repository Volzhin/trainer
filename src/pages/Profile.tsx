import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, currentUserId, type Contact, type ContactKind } from '../db/db'
import { ContactEditor } from '../components/ContactLinks'
import { Sheet } from '../components/Sheet'
import { IconSettings } from '../components/Icons'
import { useApp, useProfile } from '../store/app'
import { MyTrainerCard } from '../components/MyTrainerCard'
import { MarksGrid, StageBar, YearStrip, useGame } from '../components/Game'
import { Group, Row } from '../components/Group'
import { plural } from '../lib/calc'
import { t } from '../lib/i18n'

export function Profile() {
  const nav = useNavigate()
  const profile = useProfile()
  const { userId } = useApp()
  const game = useGame(userId)
  const [editOpen, setEditOpen] = useState(false)









  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Профиль')}</h1>
          <div className="sub">{profile?.name ?? t('Гость')}</div>
        </div>
        <button className="icon-btn" onClick={() => nav('/settings')} aria-label={t('Настройки')}>
          <IconSettings size={18} />
        </button>
      </div>

      <Group>
        <Row
          icon={(profile?.name ?? 'Г').slice(0, 1)}
          title={profile?.name ?? t('Гость')}
          sub={`${profile?.experience ? t(profile.experience) : t('Опыт не указан')}${
            profile?.height_cm ? ` · ${profile.height_cm} ${t('см')}` : ''
          }`}
          onClick={() => setEditOpen(true)}
          chevron
        />
      </Group>

      <MyTrainerCard />

      {/* Ступень, знаки и год — здесь, а не на главной: на главную приходят
          работать, а сюда — смотреть на себя. Единственное, что вынесено
          вперёд, — недельный счёт: он про то, что происходит прямо сейчас. */}
      {game && (
        <>
          <div className="section-title">{t('Ступень')}</div>
          <div className="card">
            <div className="row between">
              <div>
                <div className="strong">{t(game.stage.name)}</div>
                <div className="mute-sm">
                  {game.stage.workouts}{' '}
                  {plural(game.stage.workouts, ['тренировка', 'тренировки', 'тренировок'])}
                  {game.stage.tonnage > 0 &&
                    ` · ${Math.round(game.stage.tonnage / 1000)} ${t('т суммарно')}`}
                </div>
              </div>
              <span className="t-num" style={{ color: 'var(--accent-ink)' }}>
                {game.stage.index + 1}
              </span>
            </div>

            <div className="mt-3">
              <StageBar index={game.stage.index} />
            </div>

            {game.stage.toNext != null ? (
              <div className="mute-sm mt-2">
                {t('До ступени')} «{t(game.stage.nextName ?? '')}» — {game.stage.toNext}{' '}
                {plural(game.stage.toNext, ['тренировка', 'тренировки', 'тренировок'])}
              </div>
            ) : (
              <div className="mute-sm mt-2">{t('Последняя ступень. Дальше — просто работа.')}</div>
            )}
          </div>

          <div className="section-title">{t('Год одной строкой')}</div>
          <div className="card">
            <YearStrip year={game.year} />
            <div className="mute-sm mt-2">
              {t('Столбик — неделя, высота — сколько тренировок. Пустая неделя ничем не окрашена: это отдых, а не провал.')}
            </div>
          </div>

          <div className="section-title">{t('Знаки')}</div>
          <MarksGrid marks={game.marks} />
        </>
      )}

      <Group title={t('Мои данные')}>
        <Row
          title={t('История тренировок')}
          sub={t('Все завершённые тренировки')}
          onClick={() => nav('/history')}
          chevron
        />
        <Row
          title={t('Анализ тела')}
          sub={t('Замеры и отчёты InBody')}
          onClick={() => nav('/body')}
          chevron
        />
        <Row
          title={t('Прогресс')}
          sub={t('План программы, рост весов по упражнениям, рекорды')}
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
  const [neck, setNeck] = useState('')
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState('Новичок')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [preferred, setPreferred] = useState<ContactKind | undefined>()
  const [loaded, setLoaded] = useState(false)

  if (profile && !loaded) {
    setContacts(profile.contacts ?? [])
    setPreferred(profile.preferred_contact)
    // Опыт подтягиваем вместе с остальным: он пишется при каждом сохранении,
    // и без загрузки текущего значения правка имени сбрасывала бы человека
    // обратно в новички — а от опыта строится уровень программ.
    if (profile.experience) setExperience(profile.experience)
    setLoaded(true)
  }

  const submit = async () => {
    await db.profile.update(currentUserId(), {
      name: name.trim() || profile?.name || 'Гость',
      height_cm: height ? Number(height) : profile?.height_cm,
      neck_cm: neck ? Number(neck) : profile?.neck_cm,
      goal_weight_kg: goal ? Number(goal) : profile?.goal_weight_kg,
      experience: experience as never,
      contacts,
      preferred_contact: preferred,
      updated_at: Date.now(),
    })
    onClose()
  }

  return (
    <Sheet open={open} title={t('Профиль')} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>{t('Имя')}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={profile?.name ?? t('Гость')}
          />
        </div>
        <div className="field">
          <label>{t('Рост, см')}</label>
          <input
            className="input"
            inputMode="numeric"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder={profile?.height_cm?.toString() ?? '180'}
          />
        </div>
        {/* Шея стоит рядом с ростом: обе величины вносят один раз и правят
            здесь же, если ошиблись. В замерах их больше не спрашивают. */}
        <div className="field">
          <label>{t('Обхват шеи, см')}</label>
          <input
            className="input"
            inputMode="decimal"
            value={neck}
            onChange={(e) => setNeck(e.target.value)}
            placeholder={profile?.neck_cm?.toString() ?? '38'}
          />
          <div className="mute-sm mt-1">
            {t('Под кадыком, лента горизонтально. Нужен для расчёта процента жира.')}
          </div>
        </div>
        <div className="field">
          <label>{t('Целевой вес, кг')}</label>
          <input
            className="input"
            inputMode="decimal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={profile?.goal_weight_kg?.toString() ?? '75'}
          />
        </div>
        <div className="field">
          <label>{t('Опыт тренировок')}</label>
          <select
            className="select"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
          >
            {['Новичок', 'Средний', 'Продвинутый'].map((v) => (
              <option key={v} value={v}>{t(v)}</option>
            ))}
          </select>
        </div>
        <div className="divider" />
        <div className="field-group-title">{t('Где с вами связаться')}</div>
        <div className="mute-sm mb-3">
          {t('Тренер напишет вам туда, где вам удобно отвечать.')}
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
    </Sheet>
  )
}
