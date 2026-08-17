import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Attachment } from '../db/db'
import {
  POSE_KEYS,
  addSeriesPhoto,
  daysBetween,
  photoSeries,
  seriesLabel,
  todaySeriesDate,
  type PhotoSeries,
} from '../db/photos'
import { sendText } from '../db/chat'
import { POSES, PoseGrid } from '../components/TaskPhotos'
import { PhotoCollage } from '../components/PhotoCollage'
import { ShotThumb } from '../components/ShotThumb'
import { Sheet } from '../components/Sheet'
import { IconBack, IconPlus } from '../components/Icons'
import { useApp, useTrainerLink } from '../store/app'
import { haptics } from '../lib/native'
import { plural } from '../lib/calc'
import { t } from '../lib/i18n'

/**
 * Прогресс в фото.
 *
 * Экран отвечает на вопрос, который у задания «фото до/после» ответа не имел:
 * куда клиент денет снимки, сделанные спустя месяц. Здесь единица — серия,
 * то есть день съёмки; серий может быть сколько угодно, и любые две
 * сравниваются между собой.
 *
 * Один и тот же вид смотрят обе стороны. Тренеру он нужен «в любой момент»,
 * а не только внутри сданного задания, поэтому вид вынесен отдельно от
 * экрана клиента и встаёт вкладкой в карточку клиента — с той разницей, что
 * тренер не снимает (`readOnly`), он смотрит.
 */
export function ProgressPhotosView({
  userId,
  readOnly,
}: {
  /** Чьи снимки: у тренера это клиент, у клиента — он сам. */
  userId: string
  readOnly?: boolean
}) {
  const { toast } = useApp()
  const bond = useTrainerLink()
  // Счётчик вложений — единственный общий признак того, что снимков стало
  // больше: сама выборка идёт фильтром, а его Dexie не отслеживает.
  const version = useLiveQuery(() => db.attachments.count(), [])
  const series = useLiveQuery(() => photoSeries(userId), [userId, version])

  const [openDate, setOpenDate] = useState<string | null>(null)
  const [newDate, setNewDate] = useState<string | null>(null)
  const [pick, setPick] = useState<{ from?: string; to?: string }>({})

  // Заглушка отличается от «фото нет»: у тренера серии приезжают обменом, и
  // пустой экран в первую секунду после открытия карточки — это загрузка.
  if (series === undefined) {
    return (
      <div className="stack mt-2">
        <div className="card skeleton collage-skeleton" />
      </div>
    )
  }

  const has = (d?: string) => !!d && series.some((s) => s.date === d)
  /*
   * По умолчанию сравниваем крайние точки: самую первую съёмку и самую
   * свежую. Именно эта пара показывает результат — соседние серии за месяц
   * различаются мало, и человек решил бы, что не изменилось ничего.
   */
  const fromDate = has(pick.from) ? pick.from! : series[series.length - 1]?.date
  const toDate = has(pick.to) ? pick.to! : series[0]?.date
  const picked = [
    series.find((s) => s.date === fromDate),
    series.find((s) => s.date === toDate),
  ]
  // «Было» всегда раньше, чем «стало», как бы их ни выбрали: иначе срок
  // выходит отрицательным, а коллаж — подписанным наизнанку.
  const [before, after] =
    picked[0] && picked[1] && picked[0].date > picked[1].date
      ? [picked[1], picked[0]]
      : picked
  const days = before && after ? daysBetween(before.date, after.date) : 0

  const openSeries = openDate ? series.find((s) => s.date === openDate) : undefined
  const newSeries = newDate ? series.find((s) => s.date === newDate) : undefined

  const add = (date: string) => async (pose: NonNullable<Attachment['pose']>, file: File) => {
    await addSeriesPhoto({ date, pose, file, userId })
    haptics.success()
    toast(t('Фото добавлено'))
  }

  /*
   * В чат уходит строка, а не сам коллаж.
   *
   * Сообщение с файлом до тренера не доезжает: медиа переписки хранится
   * Blob-ом, а наверх уходит json (см. `ownerForPush` в `db/sync.ts`) —
   * клиент видел бы отправленную картинку, а тренер не получил бы ничего.
   * Снимки при этом у тренера есть: вложения возятся своим путём, и тот же
   * коллаж собирается у него сам во вкладке «Фото». Поэтому в чат идёт
   * повод открыть её — даты и срок.
   */
  const sendToTrainer = async () => {
    if (!bond || !before || !after) return
    await sendText({
      trainerId: bond.link.trainer_id,
      clientId: userId,
      authorId: userId,
      authorRole: 'CLIENT',
      text: `${t('Фото прогресса')}: ${seriesLabel(before.date)} → ${seriesLabel(after.date)}, ${days} ${plural(days, ['день', 'дня', 'дней'])}`,
    })
    haptics.success()
    toast(t('Тренер получит сообщение'))
  }

  if (series.length === 0) {
    return (
      <div className="empty">
        {readOnly
          ? t('Клиент ещё не снимал фото прогресса.')
          : t('Снимков пока нет. Снимите первую серию — с ней и будете сравнивать через месяц.')}
        {!readOnly && (
          <button
            className="btn primary block mt-4"
            onClick={() => setNewDate(todaySeriesDate())}
          >
            <IconPlus size={16} />
            {t('Снять серию')}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {!readOnly && (
        <button className="btn primary block mt-3" onClick={() => setNewDate(todaySeriesDate())}>
          <IconPlus size={16} />
          {t('Снять серию')}
        </button>
      )}

      {before && after && series.length > 1 && (
        <>
          <div className="section-title">{t('Сравнение')}</div>
          {/* Выбор двумя рядами, а не одним списком пар: пар из десяти серий
              сорок пять, и ни один список их не выдержит. Чипы стоят на
              экране, а не в карточке: они прокручиваются от края до края. */}
          <div className="field">
            <label>{t('Было')}</label>
            <div className="chips">
              {series.map((s) => (
                <button
                  key={s.date}
                  className={`chip${s.date === before.date ? ' active' : ''}`}
                  onClick={() => setPick((p) => ({ ...p, from: s.date }))}
                >
                  {seriesLabel(s.date)}
                </button>
              ))}
            </div>
          </div>
          <div className="field mt-2">
            <label>{t('Стало')}</label>
            <div className="chips">
              {series.map((s) => (
                <button
                  key={s.date}
                  className={`chip${s.date === after.date ? ' active' : ''}`}
                  onClick={() => setPick((p) => ({ ...p, to: s.date }))}
                >
                  {seriesLabel(s.date)}
                </button>
              ))}
            </div>
          </div>

          <div className="card mt-2">
            {/* Срок — половина ответа на вопрос «а есть ли результат». Две
                одинаковые фотографии за неделю и за год значат разное. */}
            <div className="progress-gap">
              <span className="figures">{days}</span>{' '}
              {plural(days, ['день', 'дня', 'дней'])}{' '}
              {days === 0 ? t('— это одна съёмка') : t('между съёмками')}
            </div>

            <SeriesPairs before={before} after={after} />
          </div>

          <div className="section-title">{t('Коллаж')}</div>
          <div className="card">
            <PhotoCollage
              before={before}
              after={after}
              onSend={!readOnly && bond ? sendToTrainer : undefined}
              sendLabel={t('Написать тренеру')}
            />
            <div className="mute-sm mt-2">
              {readOnly
                ? t('Картинку можно сохранить и показать клиенту.')
                : t('Картинку можно сохранить и отправить куда угодно — она собирается сама.')}
            </div>
          </div>
        </>
      )}

      <div className="section-title">{t('Серии')}</div>
      <div className="group">
        {series.map((s) => (
          <button key={s.date} className="group-row" onClick={() => setOpenDate(s.date)}>
            <span className="grow">
              <span className="title">{seriesLabel(s.date)}</span>
              <span className="sub">
                {s.shots.length} {t('из 4 ракурсов')}
                {s.legacy ? ` · ${t('из задания')}` : ''}
              </span>
            </span>
            <span className="series-strip">
              {s.shots.map((shot) => (
                <ShotThumb key={shot.id} attachment={shot} />
              ))}
            </span>
          </button>
        ))}
      </div>

      <SeriesSheet
        date={openSeries?.date ?? null}
        shots={openSeries?.shots ?? []}
        legacy={!!openSeries?.legacy}
        readOnly={readOnly}
        onPick={openDate ? add(openDate) : undefined}
        onClose={() => setOpenDate(null)}
      />

      <SeriesSheet
        date={newDate}
        shots={newSeries?.shots ?? []}
        legacy={false}
        onDateChange={setNewDate}
        onPick={newDate ? add(newDate) : undefined}
        onClose={() => setNewDate(null)}
      />
    </>
  )
}

/**
 * Пары «было / стало» по каждому ракурсу.
 *
 * Ракурс показываем, даже если кадра нет с одной стороны: пропуск сообщает,
 * что доснять, а молча выпавший бок выглядит как «так и было задумано».
 */
function SeriesPairs({ before, after }: { before: PhotoSeries; after: PhotoSeries }) {
  const poses = POSE_KEYS.filter(
    (p) => before.shots.some((s) => s.pose === p) || after.shots.some((s) => s.pose === p),
  )

  return (
    <div className="stack mt-3">
      {poses.map((pose) => {
        const a = before.shots.find((s) => s.pose === pose)
        const b = after.shots.find((s) => s.pose === pose)
        return (
          <div key={pose}>
            <div className="mute-sm">{t(POSES.find((p) => p.key === pose)?.label ?? '')}</div>
            <div className="pair-grid mt-1">
              {[a, b].map((shot, i) =>
                shot ? (
                  <ShotThumb key={shot.id} attachment={shot} />
                ) : (
                  <div key={i} className="shot blank">
                    {t('Кадра нет')}
                  </div>
                ),
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Одна серия крупно: те же четыре клетки, что и в задании. */
function SeriesSheet({
  date,
  shots,
  legacy,
  readOnly,
  onDateChange,
  onPick,
  onClose,
}: {
  date: string | null
  shots: Attachment[]
  legacy: boolean
  readOnly?: boolean
  /** Задан у новой серии: день съёмки ещё можно поправить. */
  onDateChange?: (date: string) => void
  onPick?: (pose: NonNullable<Attachment['pose']>, file: File) => Promise<void>
  onClose: () => void
}) {
  if (!date) return null

  return (
    <Sheet open={!!date} title={seriesLabel(date)} onClose={onClose}>
      <div className="stack">
        {onDateChange && (
          <div className="field">
            <label>{t('День съёмки')}</label>
            {/* Дату можно отодвинуть назад: снимки нередко лежат в галерее с
                выходных, и подписать их сегодняшним числом значит соврать
                сроку, по которому потом считается результат. */}
            <input
              className="input"
              type="date"
              value={date}
              max={todaySeriesDate()}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
            />
          </div>
        )}

        <PoseGrid shots={shots} readOnly={readOnly} onPick={onPick} />

        {legacy && (
          <div className="mute-sm">
            {t('Эти кадры сняты по заданию «Фото до/после» — они и есть точка отсчёта.')}
          </div>
        )}

        {!readOnly && (
          <button className="btn primary block" onClick={onClose}>
            {t('Готово')}
          </button>
        )}
      </div>
    </Sheet>
  )
}

/** Экран клиента. У тренера тот же вид живёт вкладкой в карточке клиента. */
export function ProgressPhotos() {
  const nav = useNavigate()
  const { userId } = useApp()

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{t('Прогресс в фото')}</h1>
          <div className="sub">{t('Серии по датам и сравнение любых двух')}</div>
        </div>
      </div>

      <ProgressPhotosView userId={userId} />
    </div>
  )
}
