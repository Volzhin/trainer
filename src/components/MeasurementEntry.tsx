import { useState } from 'react'
import { ManualMeasurementSheet } from './BodyCompositionView'
import { useInBodyImport } from './InBodyImport'
import { useApp } from '../store/app'
import { t } from '../lib/i18n'

/**
 * Сдача замеров: отчёт InBody файлом и ручной ввод обхватов.
 *
 * Живёт отдельно от «Анализа тела» намеренно. Тот экран отвечает на вопрос
 * «что с телом», и кнопки сдачи там мешали: человек приходил смотреть
 * динамику, а сверху ему предлагали что-то загрузить. Сдают замеры в
 * «Отчётах», рядом с весом, шагами и остальным, что клиент сдаёт тренеру.
 *
 * Разбор PDF живёт в useInBodyImport: ровно тот же разбор нужен заданию
 * «сдать InBody», и две копии этого кода разошлись бы при первой же правке.
 */
export function MeasurementEntry({ userId }: { userId: string }) {
  const { toast } = useApp()
  const [manualOpen, setManualOpen] = useState(false)
  const inbody = useInBodyImport({ userId })

  return (
    <>
      <div className="group">
        <button className="group-row" onClick={() => setManualOpen(true)}>
          <span className="grow">
            <span className="title">{t('Сдать еженедельные замеры')}</span>
            <span className="sub">{t('Обхваты, вес и процент жира вручную')}</span>
          </span>
        </button>
        <button className="group-row" disabled={inbody.busy} onClick={inbody.pick}>
          <span className="grow">
            <span className="title">
              {inbody.busy
                ? inbody.progress && inbody.progress.total > 1
                  ? `${t('Читаю')} ${inbody.progress.done + 1} ${t('из')} ${inbody.progress.total}…`
                  : t('Читаю отчёт…')
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
        onSaved={(replaced) => toast(replaced ? t('Замер обновлён') : t('Замер добавлен'))}
      />

      {inbody.node}
    </>
  )
}
