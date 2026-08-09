/**
 * Источник данных о шагах и сне.
 *
 * У веб-приложения доступа к Apple Health и Google Fit нет и не будет:
 * оба отдают данные только нативному коду. Поэтому сейчас источник ровно
 * один — то, что человек ввёл руками.
 *
 * Всё общение с «здоровьем» собрано здесь, чтобы при упаковке в Capacitor
 * подменить одну реализацию, а не искать обращения по экранам. Экраны
 * спрашивают у провайдера, умеет ли он импорт, и только по ответу решают,
 * показывать ли кнопку. Обещать автоматическую подгрузку до того, как она
 * появится, нельзя — человек перестанет вводить данные сам и потеряет их.
 */

export type HealthSample = {
  /** Локальная дата, YYYY-MM-DD. */
  date: string
  steps?: number
  sleepMinutes?: number
}

export interface HealthDataProvider {
  /** Название источника — показывается человеку, если импорт появится. */
  readonly name: string
  /** Умеет ли провайдер забирать данные сам. */
  isAvailable(): Promise<boolean>
  /**
   * Забрать данные за период. Пока импорта нет, возвращает пустой список:
   * бросать ошибку значит заставлять каждый экран её ловить ради того,
   * что и так известно заранее.
   */
  fetchRange(from: string, to: string): Promise<HealthSample[]>
}

/**
 * Заглушка на время веб-версии. Ничего не умеет и честно об этом говорит.
 */
const manualOnly: HealthDataProvider = {
  name: 'Ручной ввод',
  async isAvailable() {
    return false
  },
  async fetchRange() {
    return []
  },
}

let provider: HealthDataProvider = manualOnly

/** Подменяется при упаковке в нативную обёртку. */
export function configureHealthProvider(next: HealthDataProvider) {
  provider = next
}

export function healthProvider(): HealthDataProvider {
  return provider
}

/**
 * Доступен ли автоматический импорт. Ровно этот ответ решает, появится ли
 * в интерфейсе хоть одно упоминание автоподгрузки.
 */
export async function canImportHealthData(): Promise<boolean> {
  return provider.isAvailable()
}
