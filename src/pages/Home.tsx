import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, notificationOn } from '../db/db'
import { getActiveSession, listMySessions } from '../db/repo'
import { activeAssignmentFor } from '../db/coach'
import { dueReportReminder, nutritionReminderDue, openTasks } from '../db/reports'
import { plural, weekStart } from '../lib/calc'
import { WorkoutCalendar } from '../components/WorkoutCalendar'
import { NewAchievementCard, WeekCard, useGame } from '../components/Game'
import { IconChevronRight, IconPlay } from '../components/Icons'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

/**
 * Главный экран — это календарь тренировок и ничего больше.
 * Начать тренировку можно только отсюда, из конкретного дня: пока точек
 * запуска было несколько, экран читался как набор способов сделать одно
 * и то же. Аналитика, состав тела и история переехали в свои разделы.
 */
export function Home() {
  const nav = useNavigate()
  const { online, userId } = useApp()

  const profile = useLiveQuery(() => db.profile.get(currentUserId()), [])
  const game = useGame(userId)
  const sessions = useLiveQuery(() => listMySessions(), [])
  const active = useLiveQuery(() => getActiveSession(), [])
  const assigned = useLiveQuery(() => activeAssignmentFor(currentUserId()), [sessions?.length])
  const tasks = useLiveQuery(() => openTasks(currentUserId()), [])
  // Отложенный отчёт напоминает о себе здесь, а не уведомлением: разбудить
  // себя через четыре часа при закрытой вкладке приложение не может, и
  // единственный честный момент — когда человек вернулся сам.
  // Про день питания напоминаем после 22:00 — если в дневнике что-то есть,
  // а день так и не сдан.
  const nutritionDue = useLiveQuery(
    async () =>
      notificationOn(profile, 'nutrition_report') ? await nutritionReminderDue() : false,
    [profile?.notifications],
    false,
  )
  const reminder = useLiveQuery(
    async () =>
      notificationOn(profile, 'workout_report') ? await dueReportReminder() : undefined,
    [profile?.notifications, sessions?.length],
  )

  // Неделя тут календарная, как и в сетке под этой строкой: со скользящими
  // семью днями в понедельник счёт включал бы тренировки прошлой недели,
  // которых в календаре уже не видно.
  const weekFrom = weekStart(Date.now())
  const thisWeek = (sessions ?? []).filter((s) => s.start_time >= weekFrom).length
  const todo = tasks ?? []

  return (
    <div className={`screen${active ? ' with-banner' : ''}`}>
      <div className="header">
        <div>
          <h1>
            {t('Привет')}
            {profile?.name && profile.name !== 'Гость' ? `, ${profile.name}` : ''}
          </h1>
          <div className="sub">
            {sessions === undefined
              ? ' '
              : sessions.length === 0
                ? t('Выберите день и начните тренировку')
                : `${thisWeek} ${plural(thisWeek, ['тренировка', 'тренировки', 'тренировок'])} ${t('за неделю')}`}
          </div>
        </div>
        {!online && (
          <span className="offline-pill">
            <i className="dot" /> {t('оффлайн')}
          </span>
        )}
      </div>

      {active && (
        <button
          className="btn primary block mb-4"
          onClick={() => nav(`/session/${active.id}`)}
        >
          <IconPlay size={18} /> {t('Вернуться к тренировке')}
        </button>
      )}

      {nutritionDue && (
        <button className="list-item mb-4" onClick={() => nav('/nutrition')}>
          <div className="grow">
            <div className="strong">{t('День питания не сдан')}</div>
            <div className="mute-sm truncate">{t('Записи есть — отправьте отчёт тренеру')}</div>
          </div>
          <IconChevronRight size={16} />
        </button>
      )}

      {reminder && (
        <button className="list-item mb-4" onClick={() => nav('/reports')}>
          <div className="grow">
            <div className="strong">{t('Отчёт по тренировке не сдан')}</div>
            <div className="mute-sm truncate">{t('Вы отложили сдачу — можно сдать сейчас')}</div>
          </div>
          <IconChevronRight size={16} />
        </button>
      )}

      {/* Обязательные задания блокируют начало работы с тренером, поэтому
          напоминают о себе на главной, а выполняются в «Отчётах» — второй
          формы для них здесь нет. */}
      {todo.length > 0 && (
        <button
          className="list-item mb-4"
          onClick={() => nav('/reports')}
        >
          <div className="grow">
            <div className="strong">
              {todo.length} {plural(todo.length, ['задание', 'задания', 'заданий'])} {t('от тренера')}
            </div>
            <div className="mute-sm truncate">{t(todo[0].title)}</div>
          </div>
          <IconChevronRight size={16} />
        </button>
      )}

      {/* Счёт работы стоит выше календаря, но ниже всего, что требует
          действия: сначала «что от меня ждут», потом «как я иду». Новый
          достижение — единственное, что имеет право встать перед этим, и то
          один раз. */}
      {game && (
        <>
          <NewAchievementCard achievements={game.achievements} />
          <div className="section-title">{t('Эта неделя')}</div>
          <WeekCard game={game} />
        </>
      )}

      <WorkoutCalendar />

      {/* Свой план календарь уже показал карточкой «План» — второй блок про
          то же самое только дублировал бы его, да ещё и подписью «от тренера»,
          которого в этом плане нет. */}
      {assigned && !assigned.isSelfPlan && (
        <>
          <div className="section-title">{t('Программа от тренера')}</div>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 17 }}>{t(assigned.program.name)}</div>
            <div className="mute-sm" style={{ marginTop: 3 }}>
              {assigned.trainer?.name ?? t('Тренер')}
              {assigned.weeksLeft != null &&
                ` · ${t('осталось')} ${assigned.weeksLeft} ${plural(assigned.weeksLeft, ['неделя', 'недели', 'недель'])}`}
            </div>

            {/* Дни недели с планом: клиенту важно знать, когда он тренируется,
                а не только сколько раз. */}
            {assigned.assignment.schedule?.length ? (
              <div className="weekday-row mt-4">
                {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((rawLabel, wd) => {
                  const label = t(rawLabel)
                  const on = assigned.assignment.schedule?.some((sl) => sl.weekday === wd)
                  return (
                    <div key={wd} className={`weekday${on ? ' on' : ''}`}>
                      <span className="wd">{t(label)}</span>
                      <span className="slot">{on ? '•' : '—'}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div className="row between" style={{ marginTop: 16, marginBottom: 8 }}>
              <span className="mute-sm">{t('На этой неделе')}</span>
              <span className="mute-sm figures">
                {assigned.doneThisWeek} {t('из')} {assigned.assignment.weekly_target}
              </span>
            </div>
            <div className="bar">
              <i
                style={{
                  width: `${Math.min(100, (assigned.doneThisWeek / assigned.assignment.weekly_target) * 100)}%`,
                  background:
                    assigned.doneThisWeek >= assigned.assignment.weekly_target
                      ? 'var(--ok)'
                      : 'var(--accent)',
                }}
              />
            </div>

            {assigned.assignment.note && (
              <div
                className="mute-sm quote mt-4"
              >
                {assigned.assignment.note}
              </div>
            )}

            <button
              className="btn sm block mt-4"
              onClick={() => nav('/programs')}
            >
              {t('Открыть программу')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
