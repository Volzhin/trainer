import { useRef, useState } from 'react'
import { saveInBodyReport } from '../db/repo'
import { parseInBodyPdf, type InBodyReport } from '../lib/inbody'
import type { BodyMetric } from '../db/db'
import { formatDate } from '../lib/calc'
import { Sheet } from './Sheet'
import { ManualMeasurementSheet, metricRows } from './BodyCompositionView'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

type Parsed = { fileName: string; report?: InBodyReport; error?: string }

const PRIVACY = 'Файл никуда не отправляется — разбор идёт прямо на устройстве.'

/**
 * Сдача замеров: отчёт InBody файлом и ручной ввод обхватов.
 *
 * Живёт отдельно от «Анализа тела» намеренно. Тот экран отвечает на вопрос
 * «что с телом», и кнопки сдачи там мешали: человек приходил смотреть
 * динамику, а сверху ему предлагали что-то загрузить. Сдают замеры в
 * «Отчётах», рядом с весом, шагами и остальным, что клиент сдаёт тренеру.
 */
export function MeasurementEntry({ userId }: { userId: string }) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<Parsed[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

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
          error: e instanceof Error ? e.message : 'Не удалось разобрать PDF',
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
          ? (parsed[0].error ?? 'Не удалось разобрать PDF')
          : 'Ни один файл разобрать не удалось',
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
    let added = 0
    let replaced = 0
    for (const item of ordered) {
      const res = await saveInBodyReport(item.report, item.fileName, userId)
      if (res.replaced) replaced++
      else added++
    }

    haptics.success()
    setBusy(false)
    setPending(null)
    if (ordered.length === 1) {
      toast(replaced ? 'Замер за эту дату обновлён' : 'Замер добавлен')
    } else {
      const parts = [added && `добавлено ${added}`, replaced && `обновлено ${replaced}`]
      toast(parts.filter(Boolean).join(', '))
    }
  }

  const readyCount = (pending ?? []).filter((x) => x.report).length
  /** Один файл показываем подробно — со всеми метриками отчёта. */
  const single =
    pending && pending.length === 1 && pending[0].report
      ? (pending[0] as Parsed & { report: InBodyReport })
      : null

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void onFiles(e.target.files)}
      />

      <div className="group">
        <button className="group-row" onClick={() => setManualOpen(true)}>
          <span className="grow">
            <span className="title">{t('Сдать еженедельные замеры')}</span>
            <span className="sub">{t('Обхваты, вес и процент жира вручную')}</span>
          </span>
        </button>
        <button className="group-row" disabled={busy} onClick={() => fileRef.current?.click()}>
          <span className="grow">
            <span className="title">
              {busy
                ? progress && progress.total > 1
                  ? `Читаю ${progress.done + 1} из ${progress.total}…`
                  : 'Читаю отчёт…'
                : t('Сдать InBody')}
            </span>
            <span className="sub">{t('PDF из зала — можно выбрать сразу несколько')}</span>
          </span>
        </button>
      </div>

      <ManualMeasurementSheet
        open={manualOpen}
        userId={userId}
        onClose={() => setManualOpen(false)}
        onSaved={(replaced) => toast(replaced ? 'Замер обновлён' : 'Замер добавлен')}
      />

      <Sheet
        open={!!pending}
        title={single ? 'Данные из отчёта' : `Отчёты · ${pending?.length ?? 0}`}
        onClose={() => setPending(null)}
      >
        {single && (
          <div className="stack">
            <div className="muted">
              Отчёт от {formatDate(single.report.measured_at)}
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
              {busy ? 'Сохраняю…' : 'Добавить замер'}
            </button>
            <div className="mute-sm text-center">{PRIVACY}</div>
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
                          x.report?.weight_kg != null && `${x.report.weight_kg} кг`,
                          x.report?.body_fat_pct != null && `жир ${x.report.body_fat_pct}%`,
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
              {busy ? 'Сохраняю…' : `Добавить замеры · ${readyCount}`}
            </button>
            <div className="mute-sm text-center">{PRIVACY}</div>
          </div>
        )}
      </Sheet>
    </>
  )
}
