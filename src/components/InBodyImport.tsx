import { useRef, useState, type ReactNode } from 'react'
import { saveInBodyReport } from '../db/repo'
import { parseInBodyPdf, type InBodyReport } from '../lib/inbody'
import type { BodyMetric } from '../db/db'
import { formatDate } from '../lib/calc'
import { Sheet } from './Sheet'
import { metricRows } from './BodyCompositionView'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

type Parsed = { fileName: string; report?: InBodyReport; error?: string }

const PRIVACY = 'Файл никуда не отправляется — разбор идёт прямо на устройстве.'

/**
 * Сдача InBody: выбор PDF, разбор на устройстве и подтверждение того, что
 * прочиталось.
 *
 * Вынесено в хук, а не в компонент с кнопкой, потому что мест сдачи два и
 * выглядят они по-разному: строка в списке «Тело» и задание от тренера,
 * которое считается выполненным ровно в тот момент, когда отчёт разобран.
 * Общее у них только это — выбор файла, разбор и лист подтверждения; кнопку
 * каждый рисует свою.
 *
 * `node` возвращается наружу, потому что скрытое поле файла и лист
 * подтверждения обязаны попасть в разметку. Ставить их вызывающему — не
 * прихоть: строка сдачи живёт внутри `.group`, а лист поверх неё.
 */
export function useInBodyImport({
  userId,
  onImported,
}: {
  userId: string
  /** Что сохранилось: id замеров по возрастанию даты. */
  onImported?: (ids: string[]) => void | Promise<void>
}) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<Parsed[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setBusy(true)
    setProgress({ done: 0, total: files.length })

    // Читаем по одному, а не через Promise.all: pdf.js держит документ в
    // памяти целиком, и пачка отчётов, разобранная разом, роняет вкладку на
    // телефоне. Заодно видно, на каком файле мы сейчас.
    const parsed: Parsed[] = []
    for (const file of files) {
      try {
        parsed.push({ fileName: file.name, report: await parseInBodyPdf(file) })
      } catch (e) {
        parsed.push({
          fileName: file.name,
          error: e instanceof Error ? t(e.message) : t('Не удалось разобрать PDF'),
        })
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    if (parsed.some((x) => x.report)) {
      haptics.impact()
      setPending(parsed)
    } else {
      // Разбирать нечего — показываем причину, а не пустой лист подтверждения.
      toast(
        parsed.length === 1
          ? (parsed[0].error ?? t('Не удалось разобрать PDF'))
          : t('Ни один файл разобрать не удалось'),
      )
    }

    setBusy(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const confirmImport = async () => {
    const ready = (pending ?? []).filter(
      (x): x is Parsed & { report: InBodyReport } => !!x.report,
    )
    if (!ready.length) return
    setBusy(true)

    // По возрастанию даты: замер за один день перезаписывается, и при обратном
    // порядке из пачки за одну дату в базе оставался бы самый старый отчёт.
    const ordered = [...ready].sort((a, b) => a.report.measured_at - b.report.measured_at)
    const ids: string[] = []
    let added = 0
    let replaced = 0
    for (const item of ordered) {
      const res = await saveInBodyReport(item.report, item.fileName, userId)
      ids.push(res.id)
      if (res.replaced) replaced++
      else added++
    }

    haptics.success()
    setPending(null)
    if (ordered.length === 1) {
      toast(replaced ? t('Замер за эту дату обновлён') : t('Замер добавлен'))
    } else {
      const parts = [
        added && `${t('добавлено')} ${added}`,
        replaced && `${t('обновлено')} ${replaced}`,
      ]
      toast(parts.filter(Boolean).join(', '))
    }
    // Сначала сохранили, потом сообщаем: задание закрывается по разобранному
    // отчёту, и порядок здесь — это и есть «сдано после того, как сделано».
    await onImported?.(ids)
    setBusy(false)
  }

  const readyCount = (pending ?? []).filter((x) => x.report).length
  /** Один файл показываем подробно — со всеми метриками отчёта. */
  const single =
    pending && pending.length === 1 && pending[0].report
      ? (pending[0] as Parsed & { report: InBodyReport })
      : null

  const node: ReactNode = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void onFiles(e.target.files)}
      />

      <Sheet
        open={!!pending}
        title={single ? t('Данные из отчёта') : `${t('Отчёты')} · ${pending?.length ?? 0}`}
        onClose={() => setPending(null)}
      >
        {single && (
          <div className="stack">
            <div className="muted">
              {t('Отчёт от')} {formatDate(single.report.measured_at)}
              {single.report.person ? ` · ${single.report.person}` : ''}
            </div>
            <div className="group">
              {metricRows(single.report as unknown as BodyMetric).map(([label, value]) => (
                <div className="group-row" key={label}>
                  <span className="grow title">{label}</span>
                  <span className="value">{value}</span>
                </div>
              ))}
            </div>
            <button className="btn primary block" disabled={busy} onClick={confirmImport}>
              {busy ? t('Сохраняю…') : t('Добавить замер')}
            </button>
            <div className="mute-sm text-center">{t(PRIVACY)}</div>
          </div>
        )}

        {/* Пачка: подробности каждого отчёта тут не помещаются и не нужны —
            важно, за какие даты замеры и какие файлы не прочитались. */}
        {pending && !single && (
          <div className="stack">
            <div className="group">
              {pending.map((x, i) => (
                <div className={`group-row${x.error ? ' danger' : ''}`} key={`${x.fileName}-${i}`}>
                  <span className="grow">
                    <span className="title">
                      {x.report ? formatDate(x.report.measured_at) : x.fileName}
                    </span>
                    <span className="sub">
                      {x.error ??
                        [
                          x.report?.weight_kg != null && `${x.report.weight_kg} ${t('кг')}`,
                          x.report?.body_fat_pct != null && `${t('жир')} ${x.report.body_fat_pct}%`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button
              className="btn primary block"
              disabled={busy || readyCount === 0}
              onClick={confirmImport}
            >
              {busy ? t('Сохраняю…') : `${t('Добавить замеры')} · ${readyCount}`}
            </button>
            <div className="mute-sm text-center">{t(PRIVACY)}</div>
          </div>
        )}
      </Sheet>
    </>
  )

  return {
    /** Открыть выбор файла. */
    pick: () => fileRef.current?.click(),
    busy,
    progress,
    node,
  }
}
