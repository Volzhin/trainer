import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Attachment } from '../db/db'
import { addTaskPhoto, taskPhotos } from '../db/coach'
import { ShotThumb } from './ShotThumb'
import { IconPlus } from './Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

/** Четыре ракурса фото до/после — по кадру на каждый. */
export const POSES: { key: NonNullable<Attachment['pose']>; label: string }[] = [
  { key: 'front', label: 'Спереди' },
  { key: 'side_left', label: 'Сбоку слева' },
  { key: 'side_right', label: 'Сбоку справа' },
  { key: 'back', label: 'Сзади' },
]

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
 */
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
  const photos = useLiveQuery(() => taskPhotos(taskId, userId), [taskId, userId, version], [])
  const refs = useRef(new Map<string, HTMLInputElement | null>())

  const pick = async (pose: NonNullable<Attachment['pose']>, list: FileList | null) => {
    const file = list?.[0]
    if (!file) return
    await addTaskPhoto({ taskId, pose, file, userId })
    haptics.success()
    toast(t('Фото добавлено'))
  }

  // У тренера пустых клеток нет: они означают «сюда ещё можно снять», а он
  // снимать не будет. Если ракурса нет вовсе, об этом говорит подпись.
  const shown = readOnly ? POSES.filter((p) => photos.some((x) => x.pose === p.key)) : POSES

  if (readOnly && shown.length === 0) {
    return <div className="empty compact">{t('Фотографий нет.')}</div>
  }

  return (
    <div className="field">
      <label>{t('Фотографии')}</label>
      <div className="shot-grid">
        {shown.map(({ key, label }) => {
          const shot = photos.find((p) => p.pose === key)
          return (
            <div key={key}>
              {!readOnly && (
                <input
                  ref={(el) => refs.current.set(key, el)}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void pick(key, e.target.files)}
                />
              )}
              {shot ? (
                <ShotThumb attachment={shot} />
              ) : (
                <button
                  className="btn block"
                  style={{ aspectRatio: '3 / 4' }}
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
    </div>
  )
}
