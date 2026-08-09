import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import {
  createInvite,
  listActiveInvites,
  loadClientSummaries,
  revokeInvite,
  type ClientSummary,
} from '../../db/coach'
import { pendingReviewCount } from '../../db/reports'
import { unreadCount } from '../../db/chat'
import { Sheet } from '../../components/Sheet'
import { IconChat, IconPlus, IconRecord, IconTrash, IconUsers } from '../../components/Icons'
import { plural } from '../../lib/calc'
import { useApp, useProfile } from '../../store/app'
import { haptics } from '../../lib/native'

/** Клиент считается «выпавшим», если не тренировался больше недели. */
const STALE_DAYS = 7

export function TrainerClients() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const profile = useProfile()
  const [inviteOpen, setInviteOpen] = useState(false)

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

  const clients = useLiveQuery(
    () => loadClientSummaries(userId),
    [userId, deps?.join('-')],
    [] as ClientSummary[],
  )

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
      prs: list.reduce((a, c) => a + c.recentPRs, 0),
    }
  }, [clients])

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Клиенты</h1>
          <div className="sub">
            {profile?.name}
            {profile?.specialization ? ` · ${profile.specialization}` : ''}
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setInviteOpen(true)}
          aria-label="Пригласить"
        >
          <IconPlus size={18} />
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{stats.total}</div>
          <div className="label">клиентов</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: stats.stale ? 'var(--danger)' : undefined }}>
            {stats.stale}
          </div>
          <div className="label">выпали из графика</div>
        </div>
        <div className="stat">
          <div className="value">{stats.onTrack}</div>
          <div className="label">выполнили план недели</div>
        </div>
        <div className="stat">
          <div className="value">
            {stats.prs}
            {stats.prs > 0 && (
              <span style={{ color: 'var(--copper)', marginLeft: 6 }}>
                <IconRecord size={14} />
              </span>
            )}
          </div>
          <div className="label">рекордов за 2 недели</div>
        </div>
      </div>

      <div className="section-title">Список</div>

      {(clients ?? []).length === 0 ? (
        <div className="empty">
          <div className="big">
            <IconUsers size={34} />
          </div>
          Пока нет клиентов.
          <br />
          Выпустите код приглашения и передайте его клиенту.
          <button
            className="btn primary block"
            style={{ marginTop: 16 }}
            onClick={() => setInviteOpen(true)}
          >
            Пригласить клиента
          </button>
        </div>
      ) : (
        (clients ?? []).map((c) => {
          const stale = (c.daysSinceLast ?? 999) > STALE_DAYS
          const progress = Math.min(
            100,
            (c.sessionsThisWeek / Math.max(1, c.weeklyTarget)) * 100,
          )
          return (
            <div
              key={c.link.id}
              className="card tap"
              style={{ marginBottom: 10 }}
              onClick={() => nav(`/trainer/clients/${c.client.id}`)}
            >
              <div className="row">
                <div className="avatar">{c.client.name.slice(0, 1)}</div>
                <div className="grow">
                  <div className="row between">
                    <span style={{ fontWeight: 600 }} className="truncate">
                      {c.client.name}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      {(unread?.get(c.client.id) ?? 0) > 0 && (
                        <span className="badge pro">
                          <IconChat size={11} />
                          {unread?.get(c.client.id)}
                        </span>
                      )}
                      {(pending?.get(c.client.id) ?? 0) > 0 && (
                        <span className="badge pro">{pending?.get(c.client.id)} на разбор</span>
                      )}
                      {c.recentPRs > 0 && (
                        <span className="badge pr">
                          <IconRecord size={11} />
                          {c.recentPRs} PR
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="mute-sm"
                    style={{ color: stale ? 'var(--danger)' : undefined }}
                  >
                    {c.daysSinceLast == null
                      ? 'ещё не тренировался'
                      : c.daysSinceLast === 0
                        ? 'тренировался сегодня'
                        : `${c.daysSinceLast} ${plural(c.daysSinceLast, ['день', 'дня', 'дней'])} без тренировок`}
                  </div>
                </div>
              </div>

              {c.assignedProgramName ? (
                <div style={{ marginTop: 10 }}>
                  <div className="row between mute-sm" style={{ marginBottom: 4 }}>
                    <span className="truncate">{c.assignedProgramName}</span>
                    <span style={{ flex: '0 0 auto' }}>
                      {c.sessionsThisWeek} / {c.weeklyTarget} за неделю
                    </span>
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
                  className="btn sm primary block"
                  style={{ marginTop: 12 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    nav(`/trainer/clients/${c.client.id}?assign=1`)
                  }}
                >
                  <IconPlus size={15} /> Назначить программу
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
      onToast(`Код ${code} готов — передайте клиенту`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось создать код')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      onToast('Код скопирован')
    } catch {
      onToast(`Код: ${code}`)
    }
  }

  return (
    <Sheet open={open} title="Пригласить клиента" onClose={onClose}>
      <div className="stack">
        <div className="muted">
          Передайте код клиенту — он вводит его в своём профиле в разделе «Тренер». Код
          одноразовый и действует 7 дней.
        </div>

        <button className="btn primary block" disabled={busy} onClick={generate}>
          {busy ? 'Создаю…' : 'Выпустить новый код'}
        </button>

        {(invites ?? []).length > 0 && <div className="section-title">Активные коды</div>}
        {(invites ?? []).map((i) => (
          <div className="list-item" key={i.code}>
            <div className="grow">
              <div style={{ fontWeight: 700, letterSpacing: 2, fontSize: 20 }}>{i.code}</div>
              <div className="mute-sm">
                действует до {new Date(i.expires_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
            <button className="btn sm" onClick={() => copy(i.code)}>
              Скопировать
            </button>
            <button
              className="icon-btn"
              onClick={() => revokeInvite(i.code)}
              aria-label="Отозвать"
            >
              <IconTrash size={16} />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
