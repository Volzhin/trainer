import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, notificationOn, type NotificationKind } from '../db/db'
import { exportHistoryCsv } from '../db/repo'
import { generateDemoData, seedTrainerDemo } from '../db/demo'
import { seedIfEmpty } from '../db/seed'
import { AccountSection } from '../components/AccountSection'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { Group, Row } from '../components/Group'
import { Sheet } from '../components/Sheet'
import { ThemePicker } from '../components/ThemePicker'
import { Toggle } from '../components/Toggle'
import { IconBack } from '../components/Icons'
import { isStandalone, ensureNotificationPermission, haptics } from '../lib/native'
import { plural } from '../lib/calc'
import { useApp, useClientMode, useProfile, useRole, useTrainerLink } from '../store/app'

/**
 * Настройки приложения — общий экран для обеих ролей.
 *
 * Всё, что относится к устройству и данным, живёт здесь, а не в профиле.
 * Профиль отвечает на вопрос «кто я и с кем работаю»; настройки — на «как
 * приложение себя ведёт». Пока они лежали вместе, профиль клиента был
 * длиной в семь групп, и имя с ростом терялись между темой и очисткой базы.
 *
 * Разделы, которых нет у роли, не показываются вовсе: таймер отдыха
 * тренеру не нужен, а демо-клиенты клиенту.
 */

const REMINDERS: { kind: NotificationKind; title: string; sub: string; onlineOnly?: true }[] = [
  { kind: 'weight', title: 'Внести вес', sub: 'Каждый день в 08:00' },
  { kind: 'measurements', title: 'Внести замеры', sub: 'Воскресенье 20:00 и понедельник 08:00' },
  { kind: 'nutrition_report', title: 'Сдать отчёт по питанию', sub: 'Каждый день в 22:00' },
  {
    kind: 'workout_report',
    title: 'Сдать отчёт по тренировке',
    sub: 'Через 4 часа после тренировки, если не сдан',
    onlineOnly: true,
  },
  { kind: 'payment', title: 'Напоминание об оплате', sub: 'За 3 дня до даты оплаты' },
]

export function Settings() {
  const nav = useNavigate()
  const { toast, online, userId } = useApp()
  const profile = useProfile()
  const role = useRole()
  const bond = useTrainerLink()
  const mode = useClientMode()

  const isTrainer = role === 'TRAINER'
  const reminders = REMINDERS.filter((r) => !r.onlineOnly || mode === 'online')

  const [accountsOpen, setAccountsOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const notifGranted =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'

  const counts = useLiveQuery(async () => ({
    sessions: await db.sessions.where('is_completed').equals(1).count(),
    queue: await db.syncQueue.count(),
  }))

  const patch = (p: Record<string, unknown>) =>
    db.profile.update(currentUserId(), { ...p, updated_at: Date.now() })

  const exportCsv = async () => {
    if (profile?.plan !== 'PRO') {
      toast('Экспорт доступен в PRO')
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
    setBusy(true)
    try {
      if (isTrainer) {
        const res = await seedTrainerDemo(userId)
        toast(`Добавлено ${res.clients} ${plural(res.clients, ['клиент', 'клиента', 'клиентов'])}`)
      } else {
        const res = await generateDemoData()
        toast(`Добавлено ${res.sessions} тренировок`)
      }
      haptics.success()
      setDemoOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сгенерировать данные')
    } finally {
      setBusy(false)
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
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">Настройки</h1>
          <div className="sub">{isTrainer ? 'Кабинет тренера' : 'Приложение и данные'}</div>
        </div>
      </div>

      <Group title="Оформление">
        <div className="group-row" style={{ display: 'block' }}>
          <div className="title mb-2">Тема</div>
          <ThemePicker />
        </div>
      </Group>

      {/* Тренировочные настройки тренеру не показываем: тренировку в
          приложении ведёт клиент, а таймер отдыха у тренера ничего не
          включает. */}
      {!isTrainer && (
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
              label="Вибрация"
              value={profile?.haptics_enabled === 1}
              onChange={(v) => patch({ haptics_enabled: v ? 1 : 0 })}
            />
          </Row>
          <Row title="Звук таймера" sub="Сигнал в конце отдыха">
            <Toggle
              label="Звук таймера"
              value={profile?.sound_enabled === 1}
              onChange={(v) => patch({ sound_enabled: v ? 1 : 0 })}
            />
          </Row>
        </Group>
      )}

      <Group title="Уведомления">
        <Row
          title="Разрешение браузера"
          sub="Без него не придёт даже сигнал таймера"
          value={notifGranted ? 'Выдано' : 'Разрешить'}
          onClick={async () => {
            const ok = await ensureNotificationPermission()
            toast(ok ? 'Уведомления включены' : 'Разрешение не выдано')
          }}
          chevron
        />
      </Group>

      {/* Напоминания появляются вместе с тренером: без него напоминать не о
          чем — отчёты сдавать некому. */}
      {!isTrainer && bond && (
        <Group title="Напоминания">
          {reminders.map(({ kind, title, sub }) => (
            <Row key={kind} title={title} sub={sub}>
              <Toggle
                label={title}
                value={notificationOn(profile, kind)}
                onChange={(v) =>
                  patch({ notifications: { ...(profile?.notifications ?? {}), [kind]: v } })
                }
              />
            </Row>
          ))}
        </Group>
      )}

      <Group title="Данные">
        {!isTrainer && <Row title="Тренировок сохранено" value={counts?.sessions ?? 0} />}
        <Row
          title="Хранилище"
          sub={`${isStandalone() ? 'Приложение' : 'Браузер'} · ${online ? 'онлайн' : 'оффлайн'}`}
          value={`${counts?.queue ?? 0} в очереди`}
        />
        {!isTrainer && <Row title="Выгрузить историю в CSV" onClick={exportCsv} chevron />}
        <Row
          title={isTrainer ? 'Добавить демо-клиентов' : 'Демо-режим'}
          sub={
            isTrainer
              ? 'Несколько клиентов с историей — посмотреть кабинет в работе'
              : 'Заполнить дневник примером за 10 недель'
          }
          onClick={() => setDemoOpen(true)}
          chevron
        />
        {!isTrainer && (
          <Row title="Как это работает" onClick={() => setHelpOpen(true)} chevron />
        )}
      </Group>

      <Group title="Аккаунт">
        <Row title="Переключить аккаунт" onClick={() => setAccountsOpen(true)} chevron />
        {!isTrainer && <Row title="Восстановить каталог упражнений" onClick={reseed} />}
        {!isTrainer && (
          <Row title="Очистить историю тренировок" onClick={resetAll} danger />
        )}
      </Group>

      <AccountSection />

      <div className="mute-sm text-center mt-5">
        Прототип v0.2 · офлайн-первое хранилище IndexedDB
      </div>

      <AccountSwitcher open={accountsOpen} onClose={() => setAccountsOpen(false)} />
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Sheet
        open={demoOpen}
        title={isTrainer ? 'Демо-клиенты' : 'Демо-история'}
        onClose={() => setDemoOpen(false)}
      >
        <div className="stack">
          <div className="muted">
            {isTrainer
              ? 'Создаст несколько клиентов с тренировками, замерами и отчётами — чтобы посмотреть, как кабинет выглядит в работе.'
              : 'Сгенерирует 10 недель тренировок по сплиту Push / Pull / Legs с прогрессией весов, личными рекордами и еженедельными замерами тела.'}
          </div>
          {!isTrainer && (
            <div className="card mute-sm" style={{ color: 'var(--warn)' }}>
              Текущая история тренировок и замеры будут заменены. Каталог упражнений и ваши
              программы не пострадают.
            </div>
          )}
          <button className="btn primary block" disabled={busy} onClick={loadDemo}>
            {busy ? 'Создаю…' : isTrainer ? 'Добавить клиентов' : 'Заполнить дневник'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}

/** Справка вместо тура: объяснения доступны всегда, а не только при первом запуске. */
function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items: [string, string][] = [
    [
      'Тренировка',
      'Нажмите «Начать» на главной. Вес и повторения подставятся из прошлого раза — останется подтвердить подход галочкой.',
    ],
    [
      'Таймер отдыха',
      'Запускается автоматически после подхода. Время берётся из программы, иначе из настроек.',
    ],
    [
      'Замена упражнения',
      'Тренажёр занят — нажмите иконку замены в шапке упражнения. Введённые подходы сохранятся.',
    ],
    ['Без интернета', 'Всё пишется на устройство. Появится сеть — данные уйдут в облако сами.'],
    [
      'Тренер',
      'Получите код у тренера и введите его в разделе «Тренер». Он сможет назначать программы и комментировать тренировки.',
    ],
  ]
  return (
    <Sheet open={open} title="Как это работает" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        {items.map(([title, text]) => (
          <div key={title}>
            <div className="strong">{title}</div>
            <div className="muted mt-1">{text}</div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
