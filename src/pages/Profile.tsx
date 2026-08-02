import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId } from '../db/db'
import { Sheet } from '../components/Sheet'
import { useApp, useProfile } from '../store/app'
import { isStandalone, ensureNotificationPermission, haptics } from '../lib/native'
import { seedIfEmpty } from '../db/seed'
import { exportHistoryCsv } from '../db/repo'
import { generateDemoData } from '../db/demo'
import { MyTrainerCard } from '../components/MyTrainerCard'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { Group, Row } from '../components/Group'
import { ThemePicker } from '../components/ThemePicker'

export function Profile() {
  const nav = useNavigate()
  const { toast, online } = useApp()
  const profile = useProfile()
  const [authOpen, setAuthOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  const notifGranted =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'

  const counts = useLiveQuery(async () => ({
    sessions: await db.sessions.where('is_completed').equals(1).count(),
    exercises: await db.exercises.count(),
    queue: await db.syncQueue.count(),
  }))

  const patch = (p: Record<string, unknown>) =>
    db.profile.update(currentUserId(), { ...p, updated_at: Date.now() })

  const togglePlan = async () => {
    await patch({ plan: profile?.plan === 'PRO' ? 'FREE' : 'PRO' })
    haptics.success()
    toast(profile?.plan === 'PRO' ? 'Тариф FREE' : 'PRO активирован')
    setPayOpen(false)
  }

  const exportCsv = async () => {
    if (profile?.plan !== 'PRO') {
      toast('Экспорт доступен в PRO')
      setPayOpen(true)
      return
    }
    const csv = await exportHistoryCsv()
    // BOM, чтобы Excel корректно открыл кириллицу.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trainer-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('Файл сохранён')
  }

  const loadDemo = async () => {
    setDemoBusy(true)
    try {
      const res = await generateDemoData()
      haptics.success()
      toast(`Добавлено ${res.sessions} тренировок`)
      setDemoOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сгенерировать данные')
    } finally {
      setDemoBusy(false)
    }
  }

  const resetAll = async () => {
    await Promise.all([
      db.sessions.clear(),
      db.sets.clear(),
      db.bodyMetrics.clear(),
      db.syncQueue.clear(),
    ])
    toast('История очищена')
  }

  const reseed = async () => {
    await Promise.all([
      db.exercises.clear(),
      db.programs.clear(),
      db.routines.clear(),
      db.templateItems.clear(),
    ])
    await seedIfEmpty()
    toast('Каталог восстановлен')
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Профиль</h1>
          <div className="sub">{profile?.name ?? 'Гость'}</div>
        </div>
        <span className={`badge${profile?.plan === 'PRO' ? ' pro' : ''}`}>
          {profile?.plan ?? 'FREE'}
        </span>
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
        <Row
          title="Войти в аккаунт"
          sub="Чтобы данные не потерялись при смене телефона"
          onClick={() => setAuthOpen(true)}
          chevron
        />
      </Group>

      <MyTrainerCard />

      {profile?.plan !== 'PRO' && (
        <div className="card" style={{ marginTop: 18, borderColor: 'var(--accent-dim)' }}>
          <div className="row between">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Trainer PRO</div>
              <div className="mute-sm" style={{ marginTop: 2 }}>
                Безлимит программ, аналитика 1ПМ и экспорт истории
              </div>
            </div>
            <button className="btn sm primary" onClick={() => setPayOpen(true)}>
              499 ₽
            </button>
          </div>
        </div>
      )}

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

      <Group title="Оформление">
        <div className="group-row" style={{ display: 'block' }}>
          <div className="title" style={{ marginBottom: 8 }}>
            Тема
          </div>
          <ThemePicker />
        </div>
      </Group>

      <Group title="Тренировка">
        <Row title="Отдых по умолчанию" sub="Если в шаблоне не задан свой">
          <select
            className="select"
            style={{ width: 104, padding: '8px 10px' }}
            value={profile?.default_rest_seconds ?? 90}
            onChange={(e) => patch({ default_rest_seconds: Number(e.target.value) })}
          >
            {[45, 60, 90, 120, 150, 180, 240].map((v) => (
              <option key={v} value={v}>
                {v} сек
              </option>
            ))}
          </select>
        </Row>
        <Row title="Вибрация" sub="Отклик при подтверждении подхода">
          <Toggle
            value={profile?.haptics_enabled === 1}
            onChange={(v) => patch({ haptics_enabled: v ? 1 : 0 })}
          />
        </Row>
        <Row title="Звук таймера" sub="Сигнал в конце отдыха">
          <Toggle
            value={profile?.sound_enabled === 1}
            onChange={(v) => patch({ sound_enabled: v ? 1 : 0 })}
          />
        </Row>
        <Row
          title="Уведомления"
          sub="Оповещение об окончании отдыха"
          value={notifGranted ? 'Включены' : 'Разрешить'}
          onClick={async () => {
            const ok = await ensureNotificationPermission()
            toast(ok ? 'Уведомления включены' : 'Разрешение не выдано')
          }}
          chevron
        />
      </Group>

      <Group title="Данные">
        <Row title="Тренировок сохранено" value={counts?.sessions ?? 0} />
        <Row
          title="Хранилище"
          sub={`${isStandalone() ? 'Приложение' : 'Браузер'} · ${online ? 'онлайн' : 'оффлайн'}`}
          value={`${counts?.queue ?? 0} в очереди`}
        />
        <Row title="Выгрузить историю в CSV" onClick={exportCsv} chevron />
        <Row
          title="Демо-режим"
          sub="Заполнить дневник примером за 10 недель"
          onClick={() => setDemoOpen(true)}
          chevron
        />
        <Row title="Как это работает" onClick={() => setHelpOpen(true)} chevron />
      </Group>

      <Group>
        <Row title="Переключить аккаунт" onClick={() => setAccountsOpen(true)} chevron />
        <Row title="Восстановить каталог упражнений" onClick={reseed} />
        <Row title="Очистить историю тренировок" onClick={resetAll} danger />
      </Group>

      <div className="mute-sm" style={{ textAlign: 'center', marginTop: 20 }}>
        Прототип v0.2 · офлайн-первое хранилище IndexedDB
      </div>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Sheet open={authOpen} title="Вход" onClose={() => setAuthOpen(false)}>
        <div className="stack">
          {['Войти через VK ID', 'Войти через Яндекс ID', 'Apple ID', 'Google', 'Email и пароль'].map(
            (label) => (
              <button
                key={label}
                className="btn block"
                onClick={() => toast('Вход появится в рабочей версии')}
              >
                {label}
              </button>
            ),
          )}
          <div className="mute-sm" style={{ textAlign: 'center' }}>
            После входа локальная база сольётся с облаком по стратегии Last-Write-Wins.
          </div>
        </div>
      </Sheet>

      <Sheet open={payOpen} title="Оплата подписки" onClose={() => setPayOpen(false)}>
        <div className="stack">
          <div className="card">
            <div className="row between">
              <span>Месяц</span>
              <strong>499 ₽</strong>
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <span>Год <span className="badge">−40%</span></span>
              <strong>3 590 ₽</strong>
            </div>
          </div>
          <button className="btn primary block" onClick={togglePlan}>
            Оплатить через СБП
          </button>
          <button className="btn block" onClick={togglePlan}>
            Банковской картой (ЮKassa)
          </button>
          <div className="mute-sm" style={{ textAlign: 'center' }}>
            В прототипе оплата эмулируется и просто переключает тариф. В проде права выдаёт
            RevenueCat по вебхуку от эквайера или RuStore.
          </div>
          {profile?.plan === 'PRO' && (
            <button className="btn ghost danger block" onClick={togglePlan}>
              Вернуться на FREE
            </button>
          )}
        </div>
      </Sheet>

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
      <AccountSwitcher open={accountsOpen} onClose={() => setAccountsOpen(false)} />

      <Sheet open={demoOpen} title="Демо-история" onClose={() => setDemoOpen(false)}>
        <div className="stack">
          <div className="muted">
            Сгенерирует 10 недель тренировок по сплиту Push / Pull / Legs с прогрессией весов,
            личными рекордами и еженедельными замерами тела — чтобы посмотреть, как приложение
            выглядит у активного пользователя.
          </div>
          <div className="card mute-sm" style={{ color: 'var(--warn)' }}>
            Текущая история тренировок и замеры будут заменены. Каталог упражнений и ваши
            программы не пострадают.
          </div>
          <button className="btn primary block" disabled={demoBusy} onClick={loadDemo}>
            {demoBusy ? 'Генерирую…' : 'Заполнить дневник'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}

/** Справка вместо тура: объяснения доступны всегда, а не только при первом запуске. */
function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items: [string, string][] = [
    ['Тренировка', 'Нажмите «Начать» на главной. Вес и повторения подставятся из прошлого раза — останется подтвердить подход галочкой.'],
    ['Таймер отдыха', 'Запускается автоматически после подхода. Время берётся из программы, иначе из настроек.'],
    ['Замена упражнения', 'Тренажёр занят — нажмите иконку замены в шапке упражнения. Введённые подходы сохранятся.'],
    ['Без интернета', 'Всё пишется на устройство. Появится сеть — данные уйдут в облако сами.'],
    ['Тренер', 'Получите код у тренера и введите его в разделе «Тренер». Он сможет назначать программы и комментировать тренировки.'],
  ]
  return (
    <Sheet open={open} title="Как это работает" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        {items.map(([title, text]) => (
          <div key={title}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div className="muted" style={{ marginTop: 2 }}>
              {text}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label?: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={label ? 'row between' : ''}>
      <div className={label ? 'grow' : ''} style={label ? undefined : { display: 'none' }}>
        <div>{label}</div>
        {hint && <div className="mute-sm">{hint}</div>}
      </div>
      <button
        onClick={() => {
          haptics.selection()
          onChange(!value)
        }}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          background: value ? 'var(--accent)' : 'var(--line)',
          position: 'relative',
          transition: 'background 0.15s',
        }}
        aria-pressed={value}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState('')
  const [height, setHeight] = useState('')
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState('Новичок')

  const submit = async () => {
    await db.profile.update(currentUserId(), {
      name: name.trim() || profile?.name || 'Гость',
      height_cm: height ? Number(height) : profile?.height_cm,
      goal_weight_kg: goal ? Number(goal) : profile?.goal_weight_kg,
      experience: experience as never,
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
          <select className="select" value={experience} onChange={(e) => setExperience(e.target.value)}>
            {['Новичок', 'Средний', 'Продвинутый'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <button className="btn primary block" onClick={submit}>
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}
