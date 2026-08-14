import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  acceptTask,
  addTask,
  deleteTaskTemplate,
  listTaskTemplates,
  reviewedRefs,
  saveTaskTemplate,
  submittedNutritionDays,
  tasksOf,
  workoutReportsOf,
} from '../db/reports'
import type { ClientTask } from '../db/db'
import { formatDate } from '../lib/calc'
import { Sheet } from './Sheet'
import { ReviewSheet, type ReviewSubject } from './ReviewSheet'
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
  const tasks = useLiveQuery(() => tasksOf(clientId), [clientId])

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)


  const loading =
    reports === undefined ||
    days === undefined ||
    seenWorkouts === undefined ||
    seenDays === undefined ||
    tasks === undefined

  if (loading) return <div className="empty">{t('Загрузка…')}</div>


  /*
   * Состояния по дням для календарей. Ключ — локальная дата: тренер
   * смотрит на сетку дней, а не на идентификаторы отчётов.
   *
   * Проверенный день перекрывает сданный, если в один день их несколько:
   * жёлтая клетка означает «здесь ещё есть работа», и гасить её, пока
   * что-то не разобрано, нельзя.
   */
  const openTasks = tasks.filter((x) => x.status === 'open')
  // Сданное делится надвое: то, что ждёт тренера, и то, что он уже закрыл.
  // Пока это был один список, принятое смешивалось с новым, и тренер каждый
  // раз перечитывал всё подряд, отыскивая, что появилось.
  const awaiting = tasks.filter((x) => x.status === 'done' && x.accepted_at == null)
  const archived = tasks.filter((x) => x.status === 'done' && x.accepted_at != null)

  return (
    <div className="mt-4">
      {/* Разбор живёт там, где сдавали: тренировки в своей вкладке,
          питание в своей. Общая очередь дублировала бы их третьим списком,
          и разобранное в календаре оставалось бы «новым» здесь. */}
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{openTasks.length}</div>
          <div className="label">{t('заданий не выполнено')}</div>
        </div>
        <div className="stat">
          <div className="value">{awaiting.length}</div>
          <div className="label">{t('ждут проверки')}</div>
        </div>
      </div>

      {/* Ждущее проверки — первым блоком и с кнопкой: это единственное, что
          требует действия. Пустеет — и блока нет. */}
      {awaiting.length > 0 && (
        <>
          <div className="section-title">{t('Ждут проверки')}</div>
          <Group>
            {awaiting.map((task) => (
              <Row key={task.id} title={t(task.title)} sub={taskSub(task)}>
                <button
                  className="btn sm primary"
                  onClick={async () => {
                    await acceptTask(task.id)
                    haptics.success()
                    toast(t('Задание принято'))
                  }}
                >
                  {t('Принять')}
                </button>
              </Row>
            ))}
          </Group>
        </>
      )}

      <div className="section-title">{t('Выданные задания')}</div>
      {openTasks.length === 0 ? (
        <div className="empty compact">{t('Всё выполнено.')}</div>
      ) : (
        <Group>
          {openTasks.map((task) => (
            <Row
              key={task.id}
              title={t(task.title)}
              sub={taskSub(task)}
              danger={isOverdue(task)}
            />
          ))}
        </Group>
      )}

      {archived.length > 0 && <ArchivedTasks tasks={archived} />}
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

/**
 * Просрочено ли задание.
 *
 * Сравниваем с началом сегодняшнего дня: срок — это день целиком, и
 * задание со сроком «сегодня» не просрочено до завтра. Выполненное не
 * просрочивается никогда, даже если сдано поздно: ругать за сделанное
 * бессмысленно.
 */
export function isOverdue(task: ClientTask): boolean {
  if (task.status === 'done' || task.due_at == null) return false
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return task.due_at < start.getTime()
}

/** Подпись задания: что с ним и к какому сроку. */
function taskSub(task: ClientTask): string {
  if (task.status === 'done') {
    return task.answer ? `${t('Выполнено')} · ${task.answer}` : t('Выполнено')
  }
  const base = task.required === 1 ? t('Обязательное · не выполнено') : t('Не выполнено')
  if (task.due_at == null) return base
  return `${base} · ${isOverdue(task) ? t('просрочено') : t('до')} ${formatDate(task.due_at)}`
}

/** Принятые задания. Свёрнуты: это архив, за ним приходят намеренно. */
function ArchivedTasks({ tasks }: { tasks: ClientTask[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn block mt-3" onClick={() => setOpen((v) => !v)}>
        {t('Сданные задания')} ({tasks.length})
      </button>
      {open && (
        <Group>
          {tasks.map((task) => (
            <Row
              key={task.id}
              title={t(task.title)}
              sub={task.answer ? `${t('Принято')} · ${task.answer}` : t('Принято')}
              value={<IconCheck size={16} />}
            />
          ))}
        </Group>
      )}
    </>
  )
}

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
  const [due, setDue] = useState('')

  const templates = useLiveQuery(() => listTaskTemplates(trainerId), [trainerId, open])

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setAsTemplate(false)
    setDue('')
  }, [open])

  const save = async () => {
    setBusy(true)
    try {
      await addTask({
        clientId,
        trainerId,
        title,
        description,
        // Полдень местного времени: срок — это день, а не момент. С
        // полуночью задание, выданное «на завтра», просрочивается в ту же
        // секунду, как наступает завтра.
        dueAt: due ? new Date(`${due}T12:00:00`).getTime() : undefined,
      })
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
              {(templates ?? []).map((tpl) => (
                <div className="group-row" key={tpl.id}>
                  <button
                    className="grow"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      setTitle(tpl.title)
                      setDescription(tpl.description ?? '')
                    }}
                  >
                    {/* Заготовки пишет сам тренер — это его текст, а не строка
                        интерфейса, и переводить его нельзя. */}
                    <span className="title">{tpl.title}</span>
                    {tpl.description && <span className="sub truncate">{tpl.description}</span>}
                  </button>
                  {/* Встроенную заготовку удалять нечего: она не хранится, а
                      подставляется всем одинаково. */}
                  <button
                    className="icon-btn"
                    hidden={tpl.id.startsWith('builtin-')}
                    aria-label={`${t('Удалить заготовку')} «${tpl.title}»`}
                    onClick={() => deleteTaskTemplate(tpl.id)}
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

        <div className="field">
          <label htmlFor="task-due">{t('Срок')}</label>
          <input
            id="task-due"
            className="input"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <div className="mute-sm mt-1">
            {t('Необязательно. С сроком просроченное задание видно обоим.')}
          </div>
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
