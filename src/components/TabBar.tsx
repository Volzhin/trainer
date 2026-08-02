import { NavLink } from 'react-router-dom'
import { IconApple, IconDumbbell, IconHome, IconList, IconUser, IconUsers } from './Icons'
import { haptics } from '../lib/native'
import { useRole } from '../store/app'

const CLIENT_TABS = [
  { to: '/', label: 'Главная', Icon: IconHome, end: true },
  { to: '/programs', label: 'Программы', Icon: IconDumbbell, end: false },
  { to: '/exercises', label: 'Упражнения', Icon: IconList, end: false },
  { to: '/nutrition', label: 'Питание', Icon: IconApple, end: false },
  { to: '/profile', label: 'Профиль', Icon: IconUser, end: false },
]

const TRAINER_TABS = [
  { to: '/trainer', label: 'Клиенты', Icon: IconUsers, end: true },
  { to: '/programs', label: 'Программы', Icon: IconDumbbell, end: false },
  { to: '/exercises', label: 'Упражнения', Icon: IconList, end: false },
  { to: '/trainer/profile', label: 'Профиль', Icon: IconUser, end: false },
]

export function TabBar() {
  const role = useRole()
  const tabs = role === 'TRAINER' ? TRAINER_TABS : CLIENT_TABS

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
