import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ChatMessage, Role } from '../db/db'
import { markThreadRead, sendText, threadMessages } from '../db/chat'
import { formatDate } from '../lib/calc'
import { IconChat } from './Icons'
import { haptics } from '../lib/native'

/**
 * Ветка переписки. Одна и та же у тренера и у клиента — разговор общий,
 * и показывать его двумя разными экранами значит рано или поздно развести
 * их в деталях.
 *
 * «Прочитано» проставляется тому, что написал собеседник, и только при
 * открытом экране: отметка означает «человек это увидел», а не «строка
 * доехала до устройства».
 */
export function ChatThread({
  trainerId,
  clientId,
  meId,
  meRole,
  emptyHint,
}: {
  trainerId: string
  clientId: string
  meId: string
  meRole: Role
  emptyHint: string
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const messages = useLiveQuery(
    () => threadMessages(trainerId, clientId),
    [trainerId, clientId],
  )

  const count = messages?.length ?? 0

  // Лента прокручивается к последнему сообщению: разговор читают с конца.
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [count])

  useEffect(() => {
    if (!count) return
    void markThreadRead(trainerId, clientId, meId)
  }, [trainerId, clientId, meId, count])

  const send = async () => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await sendText({ trainerId, clientId, authorId: meId, authorRole: meRole, text: draft })
      haptics.selection()
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  if (messages === undefined) return <div className="empty">Загрузка…</div>

  return (
    <div className="chat">
      {messages.length === 0 ? (
        <div className="empty">
          <IconChat size={22} />
          <div className="mt-2">{emptyHint}</div>
        </div>
      ) : (
        <div className="chat-log" ref={logRef}>
          {messages.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              mine={m.author_id === meId}
              daySeparator={dayOf(m) !== (i > 0 ? dayOf(messages[i - 1]) : '')}
            />
          ))}
        </div>
      )}

      <div className="chat-composer">
        <textarea
          className="textarea"
          value={draft}
          rows={1}
          placeholder="Сообщение"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter отправляет, Shift+Enter переносит строку — как в
            // мессенджерах, откуда сюда и приходят с уже готовой привычкой.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          className="btn primary"
          disabled={busy || !draft.trim()}
          onClick={send}
          aria-label="Отправить"
        >
          Отправить
        </button>
      </div>
    </div>
  )
}

const dayOf = (m: ChatMessage) => new Date(m.created_at).toDateString()

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function Bubble({
  message,
  mine,
  daySeparator,
}: {
  message: ChatMessage
  mine: boolean
  daySeparator: boolean
}) {
  return (
    <>
      {daySeparator && <div className="chat-day">{formatDate(message.created_at)}</div>}
      <div className={`msg${mine ? ' mine' : ''}`}>
        <div className="msg-text">
          {/* Голосовые и файлы модель уже допускает, но отправлять их пока
              нечем. Если такое сообщение всё же встретится — честнее сказать
              об этом, чем показать пустой пузырь. */}
          {message.kind === 'text' ? message.text : 'Вложение · пока не поддерживается'}
        </div>
        <div className="msg-meta">
          {timeOf(message.created_at)}
          {mine && message.is_read === 1 && ' · прочитано'}
        </div>
      </div>
    </>
  )
}
