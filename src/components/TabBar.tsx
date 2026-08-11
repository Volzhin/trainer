import { NavLink } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { unreadCount } from '../db/chat'
import {
  IconApple,
  IconChat,
  IconClipboard,
  IconDumbbell,
  IconHome,
  IconUser,
  IconUsers,
} from './Icons'
import { haptics } from '../lib/native'
import { useApp, useRole, useTrainerLink } from '../store/app'

type Tab = { to: string; label: string; Icon: typeof IconHome; end: boolean }

/**
 * Разделы клиента. Библиотеки упражнений здесь нет намеренно: она живёт
 * внутри свободной тренировки, где её и открывают. Программы тоже не раздел —
 * до них добираются с экрана тренировок, а не наоборот.
 */
const CLIENT_TABS: Tab[] = [
  { to: '/', label: 'Тренировки', Icon: IconHome, end: true },
  { to: '/nutrition', label: 'Питание', Icon: IconApple, end: false },
]

/** Появляются только с тренером: без него писать и отчитываться некому. */
const CLIENT_BOND_TABS: Tab[] = [
  { to: '/chat', label: 'Чат', Icon: IconChat, end: false },
  { to: '/reports', label: 'Отчёты', Icon: IconClipboard, end: false },
]

const CLIENT_PROFILE_TAB: Tab = { to: '/profile', label: 'Профиль', Icon: IconUser, end: false }

const TRAINER_TABS: Tab[] = [
  { to: '/trainer', label: 'Клиенты', Icon: IconUsers, end: true },
  { to: '/programs', label: 'Программы', Icon: IconDumbbell, end: false },
  { to: '/trainer/profile', label: 'Профиль', Icon: IconUser, end: false },
]

export function TabBar() {
  const role = useRole()
  const bond = useTrainerLink()
  const { userId } = useApp()

  // Непрочитанное от тренера. Иначе о новом сообщении узнаёт только тот,
  // кто и так зашёл в чат, — то есть тот, кому напоминать не нужно.
  const unread = useLiveQuery(
    async () => (bond ? await unreadCount(bond.trainer.id, userId, userId) : 0),
    [bond?.trainer.id, userId],
  )

  /*
   * Непрочитанное у тренера — сумма по всем клиентам.
   *
   * У него нет отдельного раздела переписки: чат живёт в карточке клиента,
   * и это правильно — разговор ведут с человеком, а не с разделом. Но без
   * этой точки тренер, стоящий в «Программах», о новом вопросе не узнает
   * вовсе, пока сам не вернётся в список. Сообщение, которое не заметили,
   * ничем не отличается от неотправленного.
   */
  const trainerUnread = useLiveQuery(async () => {
    if (role !== 'TRAINER') return 0
    const links = await db.links.where('trainer_id').equals(userId).toArray()
    const counts = await Promise.all(
      links.map((l) => unreadCount(userId, l.client_id, userId)),
    )
    return counts.reduce((a, b) => a + b, 0)
  }, [role, userId])

  // Пока связка не прочитана, лишних разделов не показываем: появиться им
  // безболезненно, а исчезнуть под уже занесённым пальцем — нет.
  const tabs =
    role === 'TRAINER'
      ? TRAINER_TABS
      : [...CLIENT_TABS, ...(bond ? CLIENT_BOND_TABS : []), CLIENT_PROFILE_TAB]

  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
            onClick={() => haptics.selection()}
          >
            <Icon />
            {to === '/chat' && (unread ?? 0) > 0 && <i className="unread" />}
            {to === '/trainer' && (trainerUnread ?? 0) > 0 && <i className="unread" />}
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
