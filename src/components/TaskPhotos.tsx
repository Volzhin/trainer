import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Attachment } from '../db/db'
import { taskPhotos } from '../db/coach'
import { POSE_KEYS, addSeriesPhoto, oneShotPerPose } from '../db/photos'
import { localDate } from '../lib/tdee'
import { ShotThumb } from './ShotThumb'
import { IconPlus } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

const POSE_LABELS: Record<NonNullable<Attachment['pose']>, string> = {
  front: 'Спереди',
  side_left: 'Сбоку слева',
  side_right: 'Сбоку справа',
  back: 'Сзади',
}

/**
 * Четыре ракурса фото до/после — по кадру на каждый.
 *
 * Порядок берётся из `POSE_KEYS`, а не пишется тут заново: по нему же
 * раскладываются пары в сравнении и колонки в коллаже, и разойдись он —
 * «сбоку слева» встанет напротив «сбоку справа».
 */
export const POSES: { key: NonNullable<Attachment['pose']>; label: string }[] = POSE_KEYS.map(
  (key) => ({ key, label: POSE_LABELS[key] }),
)

/**
 * Съёмка по ракурсам, а не «приложите файлы».
 *
 * Четыре кадра сравнивают между собой через месяцы, и пачка без подписей
 * для этого не годится: непонятно, где какой бок. Отдельная клетка на
 * ракурс заодно показывает, чего ещё не хватает.
 *
 * Один компонент на обе стороны: тренер смотрит те же четыре клетки в том же
 * порядке, что заполнял клиент, — иначе «сбоку слева» у одного и «сбоку
 * справа» у другого начинают спорить друг с другом.
 *
 * Сетка вынесена из задания отдельно (`PoseGrid`): те же четыре клетки
 * заполняют и серию на экране «Прогресс в фото». Две копии одной сетки
 * разъехались бы порядком ракурсов при первой же правке — а именно порядок
 * здесь и держит сравнение.
 */
export function PoseGrid({
  shots,
  readOnly,
  onPick,
}: {
  shots: Attachment[]
  readOnly?: boolean
  onPick?: (pose: NonNullable<Attachment['pose']>, file: File) => void | Promise<void>
}) {
  const refs = useRef(new Map<string, HTMLInputElement | null>())

  // У тренера пустых клеток нет: они означают «сюда ещё можно снять», а он
  // снимать не будет. Если ракурса нет вовсе, об этом говорит подпись.
  const shown = readOnly ? POSES.filter((p) => shots.some((x) => x.pose === p.key)) : POSES

  if (readOnly && shown.length === 0) {
    return <div className="empty compact">{t('Фотографий нет.')}</div>
  }

  return (
    <div className="shot-grid">
      {shown.map(({ key, label }) => {
        const shot = shots.find((p) => p.pose === key)
        return (
          <div key={key}>
            {!readOnly && (
              <input
                ref={(el) => refs.current.set(key, el)}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  // Поле сбрасываем сразу: тот же файл, выбранный повторно,
                  // иначе не вызовет change, и «Переснять» будет выглядеть
                  // сломанной кнопкой.
                  e.target.value = ''
                  if (file) void onPick?.(key, file)
                }}
              />
            )}
            {shot ? (
              <ShotThumb attachment={shot} />
            ) : (
              <button
                className="btn block shot-add"
                onClick={() => refs.current.get(key)?.click()}
              >
                <IconPlus size={16} />
              </button>
            )}
            <div className="mute-sm text-center mt-1">{t(label)}</div>
            {/* Переснять нужно чаще, чем кажется: первый кадр то смазан, то
                снят в одежде. Без этой кнопки единственным выходом было
                просить тренера снять задание вместе с фотографиями. */}
            {shot && !readOnly && (
              <button
                className="btn sm block mt-1"
                onClick={() => refs.current.get(key)?.click()}
              >
                {t('Переснять')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function TaskPhotos({
  taskId,
  userId,
  readOnly,
}: {
  taskId: string
  /** Чьи снимки: у тренера это клиент, у клиента — он сам. */
  userId: string
  readOnly?: boolean
}) {
  const { toast } = useApp()
  const version = useLiveQuery(() => db.attachments.count(), [])
  // Прежде задание держало ровно по кадру на ракурс, потому что снимок
  // заменялся внутри задания. Теперь заменяется внутри дня, и переснятый
  // назавтра кадр оставляет вчерашний при том же задании — в клетке должен
  // стоять последний, иначе задание показывает то, что уже переснято.
  const photos = useLiveQuery(
    async () => oneShotPerPose(await taskPhotos(taskId, userId)),
    [taskId, userId, version],
    [],
  )

  const pick = async (pose: NonNullable<Attachment['pose']>, file: File) => {
    /*
     * Снимок из задания помечается днём съёмки, как и любой другой.
     *
     * Задание остаётся поводом сняться, но владеть кадрами перестало: с
     * датой они сами встают в ленту серий и через месяц есть с чем
     * сравниться. Без даты повторилась бы прежняя история — фото «до»,
     * запертые внутри выполненного задания.
     */
    await addSeriesPhoto({ taskId, pose, file, userId, date: localDate() })
    haptics.success()
    toast(t('Фото добавлено'))
  }

  return (
    <div className="field">
      <label>{t('Фотографии')}</label>
      <PoseGrid shots={photos} readOnly={readOnly} onPick={pick} />
    </div>
  )
}
