import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  addTask,
  deleteTaskTemplate,
  listTaskTemplates,
  reviewedRefs,
  saveTaskTemplate,
  submittedNutritionDays,
  tasksOf,
  workoutReportsOf,
} from '../db/reports'
import { Sheet } from './Sheet'
import { ReviewSheet, toDaySubject, toWorkoutSubject, type ReviewSubject } from './ReviewSheet'
import { Group, Row } from './Group'
import { IconCheck, IconPlus, IconTrash } from './Icons'
import { Toggle } from './Toggle'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/**
 * Что у тренера в работе по клиенту: очередь разбора и задания.
 *
 * Очередь сводит тренировки и дни питания в один список намеренно — это
 * одна стопка дел, и разложенная по двум вкладкам она перестаёт быть
 * стопкой. Сами разборы при этом открываются и отсюда, и из своих вкладок:
 * лист один и тот же.
 *
 * Отметка о проверке остаётся здесь и к клиенту не уезжает — он видит у
 * своего отчёта только «сдан». А вот ответ тренера адресован именно ему,
 * поэтому пишется на сам отчёт и приезжает к нему вместе с ним.
 */
export function ClientReports({ clientId }: { clientId: string }) {
  const { toast, userId } = useApp()


  const reports = useLiveQuery(() => workoutReportsOf(clientId), [clientId])
  const days = useLiveQuery(() => submittedNutritionDays(clientId), [clientId])
  const seenWorkouts = useLiveQuery(() => reviewedRefs(clientId, 'workout'), [clientId])
  const seenDays = useLiveQuery(() => reviewedRefs(clientId, 'nutrition'), [clientId])
  const sessions = useLiveQuery(
    () => db.sessions.where('user_id').equals(clientId).toArray(),
    [clientId],
  )
  const tasks = useLiveQuery(() => tasksOf(clientId), [clientId])

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)

  const titleOf = useMemo(() => new Map((sessions ?? []).map((s) => [s.id, s])), [sessions])

  const loading =
    reports === undefined ||
    days === undefined ||
    seenWorkouts === undefined ||
    seenDays === undefined ||
    tasks === undefined

  if (loading) return <div className="empty">{t('Загрузка…')}</div>

  const submittedWorkouts = reports.filter((r) => r.status === 'submitted')

  const queue: ReviewSubject[] = [
    ...submittedWorkouts.map((r) => toWorkoutSubject(r, titleOf.get(r.session_id)?.title)),
    ...days.map(toDaySubject),
  ].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))

  const isReviewed = (s: ReviewSubject) =>
    s.target === 'workout' ? seenWorkouts.has(s.ref) : seenDays.has(s.ref)

  const pending = queue.filter((s) => !isReviewed(s))

  /*
   * Состояния по дням для календарей. Ключ — локальная дата: тренер
   * смотрит на сетку дней, а не на идентификаторы отчётов.
   *
   * Проверенный день перекрывает сданный, если в один день их несколько:
   * жёлтая клетка означает «здесь ещё есть работа», и гасить её, пока
   * что-то не разобрано, нельзя.
   */
  const openTasks = tasks.filter((x) => x.status === 'open')
  const doneTasks = tasks.filter((x) => x.status === 'done')

  return (
    <div className="mt-4">
      <div className="stat-grid">
        <div className="stat">
          <div className="value" style={{ color: pending.length ? 'var(--warn)' : undefined }}>
            {pending.length}
          </div>
          <div className="label">{t('ждут разбора')}</div>
        </div>
        <div className="stat">
          <div className="value">{openTasks.length}</div>
          <div className="label">{t('заданий не выполнено')}</div>
        </div>
      </div>

      <div className="section-title">{t('Ждут разбора')}</div>
      {queue.length === 0 ? (
        <div className="empty compact">{t('Клиент пока ничего не сдавал.')}</div>
      ) : (
        <div>
          {queue.map((s) => (
            <button
              key={`${s.target}:${s.ref}`}
              className="list-item"
              onClick={() => setReviewing(s)}
            >
              <div className="grow">
                <div className="truncate strong">
                  {s.title}
                </div>
                <div className="mute-sm truncate">
                  {s.subtitle}
                  {s.comment ? ` · ${s.comment}` : ''}
                </div>
              </div>
              {isReviewed(s) ? (
                <span className="badge">
                  <IconCheck size={11} />
                  разобран
                </span>
              ) : (
                <span className="badge pro">{t('новый')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="section-title">{t('Задания')}</div>
      {openTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="empty compact">{t('Заданий нет.')}</div>
      ) : (
        <Group>
          {[...openTasks, ...doneTasks].map((task) => (
            <Row
              key={task.id}
              title={task.title}
              sub={
                task.status === 'done'
                  ? task.answer
                    ? `${t('Выполнено')} · ${task.answer}`
                    : t('Выполнено')
                  : task.required === 1
                    ? t('Обязательное · не выполнено')
                    : t('Не выполнено')
              }
              value={task.status === 'done' ? <IconCheck size={16} /> : undefined}
            />
          ))}
        </Group>
      )}
      <button className="btn block mt-3" onClick={() => setTaskOpen(true)}>
        <IconPlus size={16} /> {t('Выдать задание')}
      </button>

      <ReviewSheet
        subject={reviewing}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setReviewing(null)}
        onDone={() => toast(t('Отчёт разобран'))}
      />
      <TaskSheet
        open={taskOpen}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setTaskOpen(false)}
        onDone={() => toast('Задание выдано')}
      />
    </div>
  )
}

/* ------------------------- отчёт как предмет разбора ------------------- */

/* ------------------------------- задание ------------------------------- */

function TaskSheet({
  open,
  clientId,
  trainerId,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  trainerId: string
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  /** Сохранить набранное как заготовку — галочка рядом с выдачей. */
  const [asTemplate, setAsTemplate] = useState(false)

  const templates = useLiveQuery(() => listTaskTemplates(trainerId), [trainerId, open])

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setAsTemplate(false)
  }, [open])

  const save = async () => {
    setBusy(true)
    try {
      await addTask({ clientId, trainerId, title, description })
      if (asTemplate) await saveTaskTemplate({ title, description, trainerId })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={t('Задание клиенту')} onClose={onClose}>
      <div className="stack">
        {/* Заготовки сверху: чаще всего задание не сочиняют заново, а берут
            уже сформулированное. Нажатие подставляет текст в поля, а не
            выдаёт сразу — перед отправкой его почти всегда правят под
            конкретного человека. */}
        {(templates ?? []).length > 0 && (
          <>
            <div className="mute-sm">{t('Из заготовок')}</div>
            <div className="group">
              {(templates ?? []).map((t) => (
                <div className="group-row" key={t.id}>
                  <button
                    className="grow"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      setTitle(t.title)
                      setDescription(t.description ?? '')
                    }}
                  >
                    <span className="title">{t.title}</span>
                    {t.description && <span className="sub truncate">{t.description}</span>}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Удалить заготовку «${t.title}»`}
                    onClick={() => deleteTaskTemplate(t.id)}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="field">
          <label>{t('Что сделать')}</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('Например: прислать видео приседа')}
          />
        </div>
        <div className="field">
          <label>{t('Подробности')}</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('Зачем это нужно и как сделать')}
          />
        </div>

        <div className="row between">
          <span className="muted">{t('Сохранить как заготовку')}</span>
          <Toggle
            label={t('Сохранить как заготовку')}
            value={asTemplate}
            onChange={setAsTemplate}
          />
        </div>

        <button className="btn primary block" disabled={busy || !title.trim()} onClick={save}>
          {t('Выдать задание')}
        </button>
      </div>
    </Sheet>
  )
}
