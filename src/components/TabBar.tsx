import { NavLink } from 'react-router-dom'
import {
  // IconApple — вернётся вместе с разделом питания
  IconChat,
  IconClipboard,
  IconDumbbell,
  IconHome,
  IconUser,
  IconUsers,
} from './Icons'
import { haptics } from '../lib/native'
import { useRole, useTrainerLink } from '../store/app'

type Tab = { to: string; label: string; Icon: typeof IconHome; end: boolean }

/**
 * Разделы клиента. Библиотеки упражнений здесь нет намеренно: она живёт
 * внутри свободной тренировки, где её и открывают. Программы тоже не раздел —
 * до них добираются с экрана тренировок, а не наоборот.
 */
const CLIENT_TABS: Tab[] = [
  { to: '/', label: 'Тренировки', Icon: IconHome, end: true },
  // Раздел питания снят с интерфейса: он работает плохо, и показывать его
  // людям рано. Код страниц и расчётов оставлен на месте — вернуть раздел
  // значит снять комментарий здесь и в App.tsx, ничего не восстанавливая.
  // { to: '/nutrition', label: 'Питание', Icon: IconApple, end: false },
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
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
