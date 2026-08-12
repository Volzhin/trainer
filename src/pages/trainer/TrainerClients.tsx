import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import {
  createInvite,
  listActiveInvites,
  hasSubscription,
  loadClientSummaries,
  revokeInvite,
} from '../../db/coach'
import { pendingReviewCount, weekStatus, type ReviewStage } from '../../db/reports'
import { unreadCount } from '../../db/chat'
import { Sheet } from '../../components/Sheet'
import { QrCode } from '../../components/QrCode'
import { IconChat, IconPlus, IconTrash, IconUsers } from '../../components/Icons'
import { plural } from '../../lib/calc'
import { useApp, useProfile } from '../../store/app'
import { haptics } from '../../lib/native'
import { t } from '../../lib/i18n'

/**
 * Ссылка для QR-кода.
 *
 * В коде лежит адрес, а не сами шесть символов: наведя камеру телефона,
 * человек попадает сразу в приложение с подставленным кодом. Голый код
 * системная камера показала бы текстом, и его пришлось бы переписывать
 * руками — то есть ровно то, от чего QR и избавляет.
 *
 * Параметр до решётки: маршрутизация у приложения хэшевая, и всё после #
 * достаётся ей, а не нам.
 */
const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`

/** Клиент считается «выпавшим», если не тренировался больше недели. */
const STALE_DAYS = 7

export function TrainerClients() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const profile = useProfile()
  const [inviteOpen, setInviteOpen] = useState(false)
  const pro = useLiveQuery(() => hasSubscription(userId), [userId])

  // Пересчитываем при любых изменениях связей, сессий и назначений.
  const deps = useLiveQuery(
    async () => [
      await db.links.count(),
      await db.sessions.count(),
      await db.assignments.count(),
      await db.feedback.count(),
    ],
    [userId],
  )

  const clients = useLiveQuery(() => loadClientSummaries(userId), [userId, deps?.join('-')])
  // «Пока нет клиентов» с призывом выпустить код — сильное утверждение. Пока
  // список не прочитан, показываем заглушки, иначе тренер с десятком клиентов
  // при каждом заходе видит вспышку пустого экрана.
  const loading = clients === undefined

  // Сколько отчётов у каждого ждёт разбора. Запрос сам следит за таблицами
  // отчётов и отметок, поэтому в общий счётчик deps его тянуть не нужно.
  const pending = useLiveQuery(async () => {
    const entries = await Promise.all(
      (clients ?? []).map(
        async (c) => [c.client.id, await pendingReviewCount(c.client.id)] as const,
      ),
    )
    return new Map(entries)
  }, [clients])

  // Недельный счёт и стадия разбора по каждому клиенту.
  const status = useLiveQuery(async () => {
    const entries = await Promise.all(
      (clients ?? []).map(async (c) => [c.client.id, await weekStatus(c.client.id)] as const),
    )
    return new Map(entries)
  }, [clients])

  // Непрочитанные сообщения от клиентов. Тренер открывает этот список
  // первым, и вопрос, оставшийся без ответа, должен быть виден отсюда.
  const unread = useLiveQuery(async () => {
    const entries = await Promise.all(
      (clients ?? []).map(
        async (c) => [c.client.id, await unreadCount(userId, c.client.id, userId)] as const,
      ),
    )
    return new Map(entries)
  }, [clients, userId])

  const stats = useMemo(() => {
    const list = clients ?? []
    return {
      total: list.length,
      stale: list.filter((c) => (c.daysSinceLast ?? 999) > STALE_DAYS).length,
      onTrack: list.filter((c) => c.sessionsThisWeek >= c.weeklyTarget).length,
    }
  }, [clients])

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{t('Клиенты')}</h1>
          <div className="sub">
            {profile?.name}
            {profile?.specialization ? ` · ${profile.specialization}` : ''}
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setInviteOpen(true)}
          aria-label={t('Пригласить')}
          disabled={pro === false}
        >
          <IconPlus size={18} />
        </button>
      </div>

      {/* Ограничение показываем до нажатия, а не после: упереться в отказ,
          уже решив позвать человека, — худший момент узнать о подписке.
          Пока подписка не прочитана (undefined), молчим. */}
      {pro === false && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="strong">{t('Подписка не оформлена')}</div>
          <div className="mute-sm mt-1">
            {t(
              'Набирать клиентов и назначать программы можно только с подпиской. Те, кто уже с вами, никуда не денутся — их история и переписка на месте.',
            )}
          </div>
          <button className="btn primary block mt-3" onClick={() => nav('/trainer/profile')}>
            {t('Оформить подписку')}
          </button>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{stats.total}</div>
          <div className="label">{t('клиентов')}</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: stats.stale ? 'var(--danger)' : undefined }}>
            {stats.stale}
          </div>
          <div className="label">{t('выпали из графика')}</div>
        </div>
        <div className="stat">
          <div className="value">{stats.onTrack}</div>
          <div className="label">{t('выполнили план недели')}</div>
        </div>
      </div>

      <div className="section-title">{t('Список')}</div>

      {loading ? (
        <div className="stack">
          <div className="card skeleton" style={{ height: 88 }} />
          <div className="card skeleton" style={{ height: 88 }} />
        </div>
      ) : clients.length === 0 ? (
        <div className="empty">
          <div className="big">
            <IconUsers size={34} />
          </div>
          {t('Пока нет клиентов.')}
          <br />
          {pro === false
            ? t('Набор клиентов открывается с подпиской.')
            : t('Выпустите код приглашения и передайте его клиенту.')}
          {pro !== false && (
            <button className="btn primary block mt-4" onClick={() => setInviteOpen(true)}>
              {t('Пригласить клиента')}
            </button>
          )}
        </div>
      ) : (
        clients.map((c) => {
          const stale = (c.daysSinceLast ?? 999) > STALE_DAYS
          const progress = Math.min(
            100,
            (c.sessionsThisWeek / Math.max(1, c.weeklyTarget)) * 100,
          )
          return (
            <div
              key={c.link.id}
              className="card tap mb-3"
              onClick={() => nav(`/trainer/clients/${c.client.id}`)}
            >
              <div className="row">
                <div className="avatar">{c.client.name.slice(0, 1)}</div>
                <div className="grow">
                  <div className="row between">
                    <span className="truncate strong">{c.client.name}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {(pending?.get(c.client.id) ?? 0) > 0 && (
                        <span className="badge pro">
                          {pending?.get(c.client.id)} {t('на разбор')}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="mute-sm"
                    style={{ color: stale ? 'var(--danger)' : undefined }}
                  >
                    {c.daysSinceLast == null
                      ? t('ещё не тренировался')
                      : c.daysSinceLast === 0
                        ? t('тренировался сегодня')
                        : `${c.daysSinceLast} ${plural(c.daysSinceLast, ['день', 'дня', 'дней'])} ${t('без тренировок')}`}
                  </div>
                </div>

                {/* Чат — отдельная цель нажатия, а не часть строки: переписка
                    и разбор тренировок это разные разговоры, и попадать в
                    первый через второй значит терять сообщения по дороге.
                    Кнопка стоит всегда, а не только при непрочитанном:
                    написать первым тренер должен мочь в одно нажатие. */}
                <ChatButton
                  count={unread?.get(c.client.id) ?? 0}
                  name={c.client.name}
                  onOpen={(e) => {
                    e.stopPropagation()
                    nav(`/trainer/clients/${c.client.id}?tab=chat`)
                  }}
                />
              </div>

              {/* Две строки недели — под каждым клиентом, независимо от
                  того, назначена ли программа: без программы у тренировок
                  нет плана, но питание сдаётся всё равно, и молчать об этом
                  значит терять половину картины.

                  Цвет отвечает только за стадию разбора: сам по себе счёт
                  не говорит, чей сейчас ход. */}
              <div className="mt-3">
                <WeekLine
                  label={t('тренировок выполнено')}
                  done={status?.get(c.client.id)?.sessionsDone ?? c.sessionsThisWeek}
                  total={status?.get(c.client.id)?.sessionsTarget ?? null}
                  stage={status?.get(c.client.id)?.workouts ?? 'none'}
                />
                <WeekLine
                  label={t('дней по питанию сдано')}
                  done={status?.get(c.client.id)?.nutritionDays ?? 0}
                  total={7}
                  stage={status?.get(c.client.id)?.nutrition ?? 'none'}
                />
              </div>

              {c.assignedProgramName ? (
                <div className="mt-3">
                  <div className="row between mute-sm mb-1">
                    <span className="truncate">{c.assignedProgramName}</span>
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${progress}%`,
                        background: progress >= 100 ? 'var(--ok)' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* Клиент без программы — главное, что требует действия тренера,
                   поэтому призыв стоит прямо в строке, а не внутри карточки. */
                <button
                  className="btn sm primary block mt-3"
                  onClick={(e) => {
                    e.stopPropagation()
                    nav(`/trainer/clients/${c.client.id}?assign=1`)
                  }}
                >
                  <IconPlus size={15} /> {t('Назначить программу')}
                </button>
              )}
            </div>
          )
        })
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} onToast={toast} />
    </div>
  )
}

/**
 * Строка недельного счёта с цветом стадии разбора.
 *
 * Цвет означает ровно одно: чей сейчас ход. Жёлтый — клиент сдал, разбор
 * за тренером. Зелёный — разобрано, ход клиента. Без цвета — сдавать пока
 * нечего, и красить нечего тоже: пустая неделя не провинность.
 *
 * Те же два цвета, что в календарях отчётов, и по той же причине — тренер
 * не должен запоминать вторую систему обозначений.
 */
function WeekLine({
  label,
  done,
  total,
  stage,
}: {
  label: string
  done: number
  total: number | null
  stage: ReviewStage
}) {
  const color =
    stage === 'pending' ? 'var(--warn)' : stage === 'reviewed' ? 'var(--ok)' : undefined

  return (
    <div className="row between mute-sm mb-1" style={{ color }}>
      <span className="truncate">{label}</span>
      <span className="figures" style={{ flex: '0 0 auto' }}>
        {total == null ? done : `${done} / ${total}`}
      </span>
    </div>
  )
}

/**
 * Кнопка перехода в переписку с клиентом.
 *
 * Счётчик показывает непрочитанное от клиента, а не всю переписку: тренеру
 * важно, сколько вопросов осталось без ответа. Больше девяти сворачиваем в
 * «9+» — точное число за этим порогом ничего не меняет, а место занимает.
 */
function ChatButton({
  count,
  name,
  onOpen,
}: {
  count: number
  name: string
  onOpen: (e: React.MouseEvent) => void
}) {
  return (
    <button
      className={`chat-btn${count > 0 ? ' unread' : ''}`}
      onClick={onOpen}
      aria-label={
        count > 0
          ? `${t('Чат с')} ${name}, ${t('непрочитанных')}: ${count}`
          : `${t('Написать')} ${name}`
      }
    >
      <IconChat size={20} />
      {count > 0 && <span className="chat-count">{count > 9 ? '9+' : count}</span>}
    </button>
  )
}

function InviteSheet({
  open,
  onClose,
  onToast,
}: {
  open: boolean
  onClose: () => void
  onToast: (text: string) => void
}) {
  const { userId } = useApp()
  const [busy, setBusy] = useState(false)
  const invites = useLiveQuery(() => listActiveInvites(userId), [userId, open], [])

  const generate = async () => {
    setBusy(true)
    try {
      const code = await createInvite(userId)
      haptics.success()
      onToast(`${t('Код')} ${code} ${t('готов — передайте клиенту')}`)
    } catch (e) {
      onToast(e instanceof Error ? t(e.message) : t('Не удалось создать код'))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      onToast(t('Код скопирован'))
    } catch {
      onToast(`${t('Код')}: ${code}`)
    }
  }

  return (
    <Sheet open={open} title={t('Пригласить клиента')} onClose={onClose}>
      <div className="stack">
        <div className="muted">
          {t(
            'Передайте код клиенту — он вводит его в своём профиле в разделе «Тренер». Код одноразовый и действует 7 дней.',
          )}
        </div>

        <button className="btn primary block" disabled={busy} onClick={generate}>
          {busy ? t('Создаю…') : t('Выпустить новый код')}
        </button>

        {(invites ?? []).length > 0 && (
          <div className="section-title">{t('Активные коды')}</div>
        )}
        {(invites ?? []).map((i) => (
          <div className="card" key={i.code}>
            <div className="row">
              <div className="grow">
                <div style={{ fontWeight: 700, letterSpacing: 2, fontSize: 20 }}>{i.code}</div>
                <div className="mute-sm">
                  {t('действует до')} {new Date(i.expires_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
              <button className="btn sm" onClick={() => copy(i.code)}>
                {t('Скопировать')}
              </button>
              <button
                className="icon-btn"
                onClick={async () => {
                  // Отзыв идёт на сервер и может не пройти: без ответа тренер
                  // решит, что код погашен, а тот продолжит привязывать людей.
                  try {
                    await revokeInvite(i.code)
                    onToast(t('Код отозван'))
                  } catch (e) {
                    onToast(e instanceof Error ? e.message : t('Не удалось отозвать код'))
                  }
                }}
                aria-label={t('Отозвать')}
              >
                <IconTrash size={16} />
              </button>
            </div>

            {/* Код и QR рядом, а не вместо друг друга: продиктовать по
                телефону иногда быстрее, чем свести две камеры, а на
                встрече наоборот. Пусть будет и то и другое. */}
            <div className="qr-wrap mt-3">
              <QrCode value={inviteLink(i.code)} size={168} />
            </div>
            <div className="mute-sm text-center mt-2">
              {t('Клиент наводит камеру — приложение откроется с готовым кодом')}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
