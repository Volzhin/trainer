import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Program, type WorkoutSession } from '../../db/db'
import {
  addTrainerNote,
  assignProgram,
  cancelAssignment,
  deleteTrainerNote,
  listTrainerNotes,
  createPersonalProgram,
  loadClientDetail,
  personalProgramsFor,
  removeLink,
} from '../../db/coach'
import { BarChart, LineChart } from '../../components/LineChart'
import { Sheet } from '../../components/Sheet'
import { Group, Row } from '../../components/Group'
import { SessionReview } from '../../components/SessionReview'
import { IconBack, IconPlus, IconTrash } from '../../components/Icons'
import { formatDate, formatDuration, plural, totalVolume } from '../../lib/calc'
import { useApp } from '../../store/app'

export function TrainerClientDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const [tab, setTab] = useState<'overview' | 'history' | 'notes'>('overview')
  const [assignOpen, setAssignOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [reviewing, setReviewing] = useState<WorkoutSession | null>(null)

  const version = useLiveQuery(
    async () => [await db.sessions.count(), await db.assignments.count(), await db.trainerNotes.count(), await db.feedback.count()],
    [id],
  )
  const detail = useLiveQuery(() => loadClientDetail(id), [id, version?.join('-')])
  const link = useLiveQuery(
    () => db.links.where('[trainer_id+client_id]').equals([userId, id]).first(),
    [userId, id],
  )
  const assignment = useLiveQuery(
    () =>
      db.assignments
        .where('client_id')
        .equals(id)
        .and((a) => a.trainer_id === userId && a.status === 'ACTIVE')
        .first(),
    [userId, id, version?.join('-')],
  )
  const assignedProgram = useLiveQuery(
    async () => (assignment ? await db.programs.get(assignment.program_id) : undefined),
    [assignment?.program_id],
  )
  const notes = useLiveQuery(() => listTrainerNotes(id, userId), [id, userId, version?.join('-')], [])
  const personal = useLiveQuery(
    () => personalProgramsFor(id, userId),
    [id, userId, version?.join('-')],
    [] as Program[],
  )
  const allSets = useLiveQuery(() => db.sets.toArray(), [], [])

  if (!detail) return <div className="screen">Загрузка…</div>

  const { client, sessions, volumeByWeek, records, weightPoints } = detail
  const lastSession = sessions[0]

  const unlink = async () => {
    if (!link) return
    await removeLink(link.id)
    toast('Клиент отвязан')
    nav('/trainer', { replace: true })
  }

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>{client.name}</h1>
          <div className="sub">
            {client.experience ?? 'опыт не указан'}
            {client.height_cm ? ` · ${client.height_cm} см` : ''}
          </div>
        </div>
      </div>

      <div className="chips">
        {(
          [
            ['overview', 'Сводка'],
            ['history', 'Тренировки'],
            ['notes', 'Заметки'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`chip${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat">
              <div className="value">{sessions.length}</div>
              <div className="label">тренировок</div>
            </div>
            <div className="stat">
              <div className="value">
                {lastSession ? formatDate(lastSession.start_time) : '—'}
              </div>
              <div className="label">последняя</div>
            </div>
          </div>

          <div className="section-title">Программа от вас</div>
          <div className="card">
            {assignment && assignedProgram ? (
              <>
                <div className="row between">
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{assignedProgram.name}</div>
                    <div className="mute-sm">
                      цель {assignment.weekly_target}{' '}
                      {plural(assignment.weekly_target, ['тренировка', 'тренировки', 'тренировок'])} в неделю
                      {' · с '}
                      {formatDate(assignment.start_at)}
                    </div>
                  </div>
                </div>
                {assignment.note && (
                  <div className="muted" style={{ marginTop: 8 }}>
                    {assignment.note}
                  </div>
                )}
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <button className="btn sm grow" onClick={() => setAssignOpen(true)}>
                    Заменить
                  </button>
                  <button
                    className="btn sm ghost danger"
                    onClick={async () => {
                      await cancelAssignment(assignment.id)
                      toast('Назначение отменено')
                    }}
                  >
                    Снять
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="muted">Программа не назначена.</div>
                <button
                  className="btn primary block"
                  style={{ marginTop: 12 }}
                  onClick={() => setAssignOpen(true)}
                >
                  Назначить готовую программу
                </button>
              </>
            )}
            <button
              className="btn block"
              style={{ marginTop: 8 }}
              onClick={async () => {
                const programId = await createPersonalProgram({
                  clientId: id,
                  trainerId: userId,
                })
                toast('Персональная программа создана')
                nav(`/programs/${programId}`)
              }}
            >
              <IconPlus size={16} /> Собрать персональную программу
            </button>
          </div>

          {(personal ?? []).length > 0 && (
            <Group title="Персональные программы">
              {(personal ?? []).map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  sub={p.id === assignment?.program_id ? 'назначена сейчас' : 'не назначена'}
                  onClick={() => nav(`/programs/${p.id}`)}
                  chevron
                />
              ))}
            </Group>
          )}

          <div className="section-title">Тоннаж по неделям</div>
          <div className="card">
            <BarChart
              data={volumeByWeek.map((v) => v.value)}
              labels={volumeByWeek.map((v) => v.label)}
            />
          </div>

          <div className="section-title">Рекорды · расчётный 1ПМ</div>
          {records.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              Данных пока нет
            </div>
          ) : (
            records.map((r) => (
              <div className="list-item" key={r.name}>
                <div className="grow truncate">{r.name}</div>
                <strong>{Math.round(r.score)} кг</strong>
              </div>
            ))
          )}

          <div className="section-title">Вес</div>
          <div className="card">
            <LineChart data={weightPoints} unit=" кг" color="var(--success)" />
          </div>

          <button className="btn ghost danger block" style={{ marginTop: 20 }} onClick={unlink}>
            Прекратить работу с клиентом
          </button>
          <div className="mute-sm" style={{ textAlign: 'center', marginTop: 8 }}>
            История тренировок останется у клиента — вы просто потеряете к ней доступ.
          </div>
        </>
      )}

      {tab === 'history' && (
        <div style={{ marginTop: 14 }}>
          {sessions.length === 0 && <div className="empty">Тренировок пока нет</div>}
          {sessions.map((s) => {
            const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
            return (
              <div className="card" key={s.id} style={{ marginBottom: 8 }}>
                <div className="row between">
                  <div className="grow">
                    <div className="truncate" style={{ fontWeight: 600 }}>
                      {s.title}
                    </div>
                    <div className="mute-sm">
                      {formatDate(s.start_time)} · {sets.length}{' '}
                      {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                      {Math.round(totalVolume(sets))} кг ·{' '}
                      {formatDuration((s.end_time ?? s.start_time) - s.start_time)}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => setReviewing(s)}>
                    Разобрать
                  </button>
                </div>
                {s.notes && (
                  <div className="mute-sm" style={{ marginTop: 8 }}>
                    Заметка клиента: {s.notes}
                  </div>
                )}
                <SessionFeedback sessionId={s.id} />
              </div>
            )
          })}
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ marginTop: 14 }}>
          <button className="btn block" onClick={() => setNoteOpen(true)}>
            <IconPlus size={16} /> Добавить заметку
          </button>
          <div className="mute-sm" style={{ textAlign: 'center', margin: '8px 0 14px' }}>
            Заметки видны только вам.
          </div>
          {(notes ?? []).length === 0 && <div className="empty">Заметок пока нет</div>}
          {(notes ?? []).map((n) => (
            <div className="card" key={n.id} style={{ marginBottom: 8 }}>
              <div className="row between">
                <div className="mute-sm">{formatDate(n.created_at)}</div>
                <button
                  className="icon-btn"
                  onClick={() => deleteTrainerNote(n.id)}
                  aria-label="Удалить"
                >
                  <IconTrash size={15} />
                </button>
              </div>
              <div style={{ marginTop: 6 }}>{n.text}</div>
            </div>
          ))}
        </div>
      )}

      <AssignSheet
        open={assignOpen}
        clientId={id}
        onClose={() => setAssignOpen(false)}
        onDone={() => toast('Программа назначена')}
      />

      <TextSheet
        open={noteOpen}
        title="Заметка о клиенте"
        placeholder="Травмы, ограничения, договорённости"
        onClose={() => setNoteOpen(false)}
        onSubmit={async (text) => {
          await addTrainerNote(id, text, userId)
          toast('Заметка сохранена')
        }}
      />

      <SessionReview session={reviewing} clientId={id} onClose={() => setReviewing(null)} />
    </div>
  )
}

function SessionFeedback({ sessionId }: { sessionId: string }) {
  const rows = useLiveQuery(
    () => db.feedback.where('session_id').equals(sessionId).toArray(),
    [sessionId],
    [],
  )
  if (!rows?.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      {rows.map((f) => (
        <div
          key={f.id}
          className="mute-sm"
          style={{
            borderLeft: '2px solid var(--accent)',
            paddingLeft: 10,
            marginTop: 6,
            color: 'var(--text-dim)',
          }}
        >
          {f.text}
          {f.is_read === 0 && <span className="badge" style={{ marginLeft: 8 }}>не прочитано</span>}
        </div>
      ))}
    </div>
  )
}

function AssignSheet({
  open,
  clientId,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  onClose: () => void
  onDone: () => void
}) {
  const { userId } = useApp()
  const [programId, setProgramId] = useState('')
  const [target, setTarget] = useState(3)
  const [note, setNote] = useState('')

  // Тренер назначает свои программы и готовые сплиты платформы.
  const programs = useLiveQuery(
    () =>
      db.programs
        .filter((p) => p.author_id === userId || p.author_id === 'system')
        .toArray(),
    [userId],
    [] as Program[],
  )

  const submit = async () => {
    const id = programId || programs?.[0]?.id
    if (!id) return
    await assignProgram({ clientId, programId: id, weeklyTarget: target, note, trainerId: userId })
    setNote('')
    onDone()
    onClose()
  }

  return (
    <Sheet open={open} title="Назначить программу" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Программа</label>
          <select
            className="select"
            value={programId || programs?.[0]?.id || ''}
            onChange={(e) => setProgramId(e.target.value)}
          >
            {(programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.author_id === userId ? ' (моя)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Тренировок в неделю</label>
          <select
            className="select"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Комментарий для клиента</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: первые две недели работаем в лёгком темпе"
          />
        </div>
        <button className="btn primary block" disabled={!programs?.length} onClick={submit}>
          Назначить
        </button>
      </div>
    </Sheet>
  )
}

function TextSheet({
  open,
  title,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  placeholder: string
  onClose: () => void
  onSubmit: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')

  const submit = async () => {
    if (!text.trim()) return
    await onSubmit(text)
    setText('')
    onClose()
  }

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="stack">
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
        <button className="btn primary block" disabled={!text.trim()} onClick={submit}>
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}
