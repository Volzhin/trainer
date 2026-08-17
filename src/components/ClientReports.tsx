import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  acceptTask,
  addTask,
  deleteTask,
  deleteTaskTemplate,
  listTaskTemplates,
  reviewedRefs,
  saveTaskTemplate,
  submittedNutritionDays,
  taskFileCount,
  taskResultMetric,
  tasksOf,
  workoutReportsOf,
} from '../db/reports'
import type { ClientTask } from '../db/db'
import { formatDate } from '../lib/calc'
import { Sheet } from './Sheet'
import { ReviewSheet, type ReviewSubject } from './ReviewSheet'
import { metricRows } from './BodyCompositionView'
import { TaskPhotos } from './TaskPhotos'
import { Group, Row } from './Group'
import { IconPlus, IconTrash } from './Icons'
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
  const seenTasks = useLiveQuery(() => reviewedRefs(clientId, 'task'), [clientId, tasks?.length])

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  // Анкету тренер читает целиком: свободные ответы про мотивацию и поддержку
  // нигде больше не показываются, а собирали их ради него.
  const [reading, setReading] = useState<ClientTask | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  /** Задание, которое тренер собрался снять. Через подтверждение — см. ниже. */
  const [removing, setRemoving] = useState<ClientTask | null>(null)


  const loading =
    reports === undefined ||
    days === undefined ||
    seenWorkouts === undefined ||
    seenDays === undefined ||
    tasks === undefined ||
    seenTasks === undefined

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
  // Принято ли задание, знает строка тренера, а не само задание: в нём эта
  // отметка не удержалась бы при обмене. accepted_at читаем запасным
  // вариантом — так отмечали до переезда.
  const isAccepted = (task: ClientTask) =>
    task.accepted_at != null || (seenTasks?.has(task.id) ?? false)
  const awaiting = tasks.filter((x) => x.status === 'done' && !isAccepted(x))
  const archived = tasks.filter((x) => x.status === 'done' && isAccepted(x))

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
            {/* Строка не кликается целиком: внутри неё живёт кнопка, а кнопка
                в кнопке — недопустимая вложенность, и нажатие «Принять»
                заодно открывало анкету. */}
            {awaiting.map((task) => (
              <Row key={task.id} title={t(task.title)} sub={taskSub(task)}>
                {/* «Смотреть» у каждого задания, а не только у анкеты: принять
                    не глядя тренер может и так, а вот открыть присланное —
                    фотографии, замеры, отчёт InBody — раньше было негде. */}
                <button className="btn sm" onClick={() => setReading(task)}>
                  {t('Смотреть')}
                </button>
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
            >
              {/* Открыть можно и невыполненное: тренер перечитывает, что сам
                  написал в подробностях, — в строке они не помещаются. */}
              <button className="btn sm" onClick={() => setReading(task)}>
                {t('Смотреть')}
              </button>
              {/* Снять выданное. У «ждут проверки» такой кнопки нет намеренно:
                  там от тренера ждут «Принять», а снести сделанное клиентом
                  одним нажатием рядом с ним — слишком легко промахнуться.
                  Принятое потом убирается из архива. */}
              <button
                className="icon-btn"
                aria-label={`${t('Удалить задание')} «${task.title}»`}
                onClick={() => setRemoving(task)}
              >
                <IconTrash size={15} />
              </button>
            </Row>
          ))}
        </Group>
      )}

      {archived.length > 0 && (
        <ArchivedTasks tasks={archived} onOpen={setReading} onRemove={setRemoving} />
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
      <TaskReviewSheet
        task={reading}
        clientId={clientId}
        accepted={reading ? isAccepted(reading) : false}
        onClose={() => setReading(null)}
        onAccepted={() => toast(t('Задание принято'))}
      />

      <TaskSheet
        open={taskOpen}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setTaskOpen(false)}
        onDone={() => toast('Задание выдано')}
      />

      <RemoveTaskSheet
        task={removing}
        trainerId={userId}
        onClose={() => setRemoving(null)}
        onDone={() => toast(t('Задание снято'))}
      />
    </div>
  )
}

/**
 * Подтверждение снятия задания.
 *
 * Отдельным шагом, потому что снятие видно клиенту и необратимо: задание
 * исчезнет у него с главной, а приложенные к нему файлы — из хранилища.
 * Сколько их, говорим до нажатия, а не после.
 */
function RemoveTaskSheet({
  task,
  trainerId,
  onClose,
  onDone,
}: {
  task: ClientTask | null
  trainerId: string
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState(0)

  // Считаем один раз, при открытии, а не подпиской: индекса по task_id нет, и
  // подписка перечитывала бы всю таблицу вложений с видео внутри на каждое
  // изменение — см. taskFileCount.
  useEffect(() => {
    if (!task) return
    let alive = true
    void taskFileCount(task.id).then((n) => {
      if (alive) setFiles(n)
    })
    return () => {
      alive = false
    }
  }, [task?.id])

  const remove = async () => {
    if (!task) return
    setBusy(true)
    try {
      await deleteTask(task.id, trainerId)
      haptics.success()
      onDone()
      onClose()
    } catch {
      toast(t('Не удалось снять задание — попробуйте ещё раз'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!task} title={t('Снять задание')} onClose={onClose}>
      <div className="stack">
        {/* Формулировку задания писал тренер — это его текст, не строка
            интерфейса, и переводить его нельзя. */}
        <div className="strong">{task?.title}</div>
        <div className="muted">
          {task?.required === 1
            ? t('Обязательное задание. Оно вернётся, если связь с клиентом оформят заново.')
            : t('Клиент перестанет его видеть.')}
        </div>
        {/* Файлы не трогаем: у клиента это единственная копия его же фото.
            Но и молчать о них нельзя — открыть их после снятия будет
            неоткуда, и решать это тренеру до нажатия, а не задним числом. */}
        {files > 0 && (
          <div className="muted">
            {t('Приложенных файлов')}: {files}.{' '}
            {t('Они останутся у клиента, но открыть их будет неоткуда — задания, из которого они видны, не станет.')}
          </div>
        )}
        <button className="btn danger block" disabled={busy} onClick={remove}>
          {busy ? t('Снимаю…') : t('Снять задание')}
        </button>
      </div>
    </Sheet>
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
function ArchivedTasks({
  tasks,
  onOpen,
  onRemove,
}: {
  tasks: ClientTask[]
  onOpen: (task: ClientTask) => void
  onRemove: (task: ClientTask) => void
}) {
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
            >
              {/* Принятое открывается так же, как ждущее проверки: к фото
                  «до» тренер возвращается через месяцы, и «принято» не
                  должно означать «больше не посмотреть». */}
              <button className="btn sm" onClick={() => onOpen(task)}>
                {t('Смотреть')}
              </button>
              <button
                className="icon-btn"
                aria-label={`${t('Удалить задание')} «${task.title}»`}
                onClick={() => onRemove(task)}
              >
                <IconTrash size={15} />
              </button>
            </Row>
          ))}
        </Group>
      )}
    </>
  )
}

/* ------------------------ что клиент прислал по заданию ---------------- */

/**
 * Выполненное задание глазами тренера — не «выполнено», а то, чем оно
 * выполнено.
 *
 * Один лист на все виды: тренер открывает задание одинаково, а внутри
 * показывается сделанное дело — фотографии по ракурсам, цифры замера,
 * разобранный отчёт InBody, ответы анкеты или написанный текст. Пока
 * открывалась одна анкета, всё остальное клиент отправлял в пустоту:
 * тренер видел строку «выполнено» и шёл спрашивать в чат, что именно.
 */
function TaskReviewSheet({
  task,
  clientId,
  accepted,
  onClose,
  onAccepted,
}: {
  task: ClientTask | null
  clientId: string
  accepted: boolean
  onClose: () => void
  onAccepted: () => void
}) {
  const [busy, setBusy] = useState(false)
  // Замер читаем при открытии: ссылка на него лежит в самом задании, а у
  // сданных до её появления он ищется по дате — см. taskResultMetric.
  const metric = useLiveQuery(
    async () => (task ? ((await taskResultMetric(task)) ?? null) : null),
    [task?.id, task?.result_ref, task?.completed_at],
  )

  if (!task) return null

  const wantsMetric = task.kind === 'measurements' || task.kind === 'inbody'
  const done = task.status === 'done'

  const accept = async () => {
    setBusy(true)
    try {
      await acceptTask(task.id, clientId)
      haptics.success()
      onAccepted()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!task} title={t(task.title)} onClose={onClose}>
      <div className="mute-sm">
        {!done
          ? taskSub(task)
          : task.completed_at
            ? `${t('Выполнено')} ${formatDate(task.completed_at)}`
            : t('Выполнено')}
      </div>
      {task.description && <div className="muted mt-2">{t(task.description)}</div>}

      <div className="stack mt-4">
        {task.kind === 'photos' && <TaskPhotos taskId={task.id} userId={clientId} readOnly />}

        {wantsMetric &&
          (metric === undefined ? (
            <div className="card skeleton" style={{ height: 96 }} />
          ) : metric ? (
            <>
              <div className="mute-sm">
                {task.kind === 'inbody' ? t('Отчёт от') : t('Замер от')}{' '}
                {formatDate(metric.logged_at)}
                {metric.source_file ? ` · ${metric.source_file}` : ''}
              </div>
              <div className="group">
                {metricRows(metric).map(([label, value]) => (
                  <div className="group-row" key={label}>
                    <span className="grow title">{label}</span>
                    <span className="value figures">{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Замера может не быть по двум причинам: он ещё не доехал (обмен
               возит строки по одной) или задание закрыли комментарием — так
               было до того, как его стал закрывать сам замер. Обещать «сейчас
               подгрузится» во втором случае нечестно, поэтому говорим, где
               искать. */
            <div className="empty compact">
              {done
                ? t('Цифр к заданию не привязано — ищите замер во вкладке «Тело».')
                : t('Клиент ещё не сдал замер.')}
            </div>
          ))}

        {task.answers && (
          <div className="stack">
            {Object.entries(task.answers).map(([question, value]) => (
              <div key={question}>
                <div className="mute-sm">{t(question)}</div>
                <div className="mt-1">{value}</div>
              </div>
            ))}
          </div>
        )}

        {task.answer && (
          <div className="card">
            <div className="mute-sm">{t('Что написал клиент')}</div>
            <div className="mt-1">{task.answer}</div>
          </div>
        )}

        {done &&
          (accepted ? (
            <div className="mute-sm text-center">{t('Задание принято.')}</div>
          ) : (
            <button className="btn primary block" disabled={busy} onClick={accept}>
              {t('Принять')}
            </button>
          ))}
      </div>
    </Sheet>
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
