import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
import { t } from '../lib/i18n'
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

  const { pathname } = useLocation()
  const { inner, pill } = usePill(pathname, tabs.length)

  return (
    <nav className="tabbar">
      <div className="tabbar-inner" ref={inner}>
        {/* Подложка активного раздела переезжает, а не перекрашивается:
            видно, откуда и куда переключились. Отдельным слоем под
            ссылками — вкладки разной ширины, и на них её не размазать. */}
        <span className="tab-pill" style={pill} aria-hidden />
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
            <span>{t(label)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/**
 * Где стоит подложка активной вкладки.
 *
 * Считаем по разметке, а не по номеру вкладки: их число меняется — у
 * клиента без тренера разделов меньше, — и доля ширины разъезжалась бы с
 * тем, что человек видит. Пересчитываем на смену адреса и на изменение
 * размера: поворот телефона меняет ширину, а подложка осталась бы на
 * прежнем месте.
 */
function usePill(activePath: string, count: number) {
  const inner = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<React.CSSProperties>({
    width: 0,
    transform: 'translateX(0)',
    opacity: 0,
  })
  /*
   * Первую постановку делаем без перехода.
   *
   * Иначе подложка на каждом открытии приложения выезжает от левого края к
   * своей вкладке: переезд должен показывать переключение разделов, а на
   * первом кадре переключаться было не с чего.
   */
  const first = useRef(true)

  useEffect(() => {
    const fit = () => {
      const box = inner.current
      const active = box?.querySelector<HTMLElement>('.tab.active')
      if (!box || !active) return setPill((p) => ({ ...p, opacity: 0 }))
      const b = box.getBoundingClientRect()
      const a = active.getBoundingClientRect()
      // Подложка уже вкладки: она обводит иконку с подписью, а не занимает
      // всю ячейку — иначе соседние пилюли смыкались бы в сплошную полосу.
      const width = Math.min(a.width - 8, 96)
      const placed = {
        width,
        transform: `translateX(${a.left - b.left + (a.width - width) / 2}px)`,
        opacity: 1,
      }
      if (first.current) {
        first.current = false
        setPill({ ...placed, transition: 'none' })
        requestAnimationFrame(() => setPill(placed))
        return
      }
      setPill(placed)
    }
    // Кадр на отрисовку: сразу после перехода ссылка ещё без класса active.
    const id = requestAnimationFrame(fit)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', fit)
    }
  }, [activePath, count])

  return { inner, pill }
}
