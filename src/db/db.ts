import Dexie, { type Table } from 'dexie'

/**
 * Локальная база — источник истины во время тренировки (Offline-First).
 * Идентификаторы — UUID v4, чтобы записи, созданные оффлайн на разных
 * устройствах, не конфликтовали при последующей синхронизации.
 * Поле updated_at обслуживает стратегию LWW (Last-Write-Wins).
 */

/**
 * Упражнение каталога. Мышечные группы и оборудование хранятся строками:
 * справочник приходит из внешней базы и содержит больше значений, чем
 * имеет смысл перечислять в коде — списки фильтров собираются из данных.
 */
export interface Exercise {
  id: string
  name: string
  /** Синонимы из источника — по ним тоже ищем. */
  alt_names?: string[]
  muscle_group: string
  secondary?: string[]
  equipment: string
  /** Конкретный инвентарь: «Скамья с регулируемым углом», «Рукоятка канат». */
  equipment_all?: string[]
  /** Изоляция / базовое и т.п. */
  exercise_type?: string
  /** Виды спорта, к которым относится упражнение. */
  sports?: string[]
  /** Противопоказания из источника. */
  restrictions?: string[]
  accents?: string[]
  is_custom: 0 | 1 // числом — Dexie не индексирует boolean
  creator_id?: string
  description?: string
  image_url?: string
  video_url?: string
  /** Прямой mp4 — играется во встроенном плеере без внешнего сервиса. */
  clip_url?: string
  is_time_based?: 0 | 1
  updated_at: number
}

export interface Program {
  id: string
  name: string
  description?: string
  author_id: string
  goal: 'Гипертрофия' | 'Сила' | 'Похудение' | 'Дом' | 'Кроссфит'
  level: 'Новичок' | 'Средний' | 'Продвинутый'
  is_public: 0 | 1
  /** Задан — программа собрана тренером под конкретного клиента. */
  client_id?: string
  updated_at: number
}

export interface WorkoutRoutine {
  id: string
  program_id: string
  name: string
  day_order: number
  updated_at: number
}

export interface WorkoutTemplateItem {
  id: string
  routine_id: string
  exercise_id: string
  sequence_order: number
  target_sets: number
  target_reps?: number
  rest_seconds: number
  /** Упражнения с одинаковым superset_group выполняются как суперсет. */
  superset_group?: string
  updated_at: number
}

export interface WorkoutSession {
  id: string
  user_id: string
  routine_id?: string
  title: string
  start_time: number
  end_time?: number
  notes?: string
  is_completed: 0 | 1
  updated_at: number
}

export interface ExerciseSet {
  id: string
  workout_session_id: string
  exercise_id: string
  sequence_order: number
  set_number: number
  weight_kg?: number
  reps_completed?: number
  duration_seconds?: number
  is_pr: 0 | 1
  is_done: 0 | 1
  updated_at: number
}

export interface BodyMetric {
  id: string
  user_id: string
  weight_kg?: number
  body_fat_pct?: number
  chest_cm?: number
  waist_cm?: number
  hip_cm?: number
  neck_cm?: number
  thigh_cm?: number
  /** Отношения обхватов — считаются при вводе и хранятся вместе с замером. */
  waist_to_height?: number
  waist_to_hip?: number
  /** Часть показателей выведена из обхватов, а не измерена приборно. */
  derived?: 0 | 1

  /** Поля биоимпедансного анализа (InBody / DDX). Заполняются при импорте PDF. */
  skeletal_muscle_kg?: number
  body_fat_kg?: number
  body_water_l?: number
  protein_kg?: number
  minerals_kg?: number
  visceral_fat?: number
  bmi?: number
  fat_free_mass_kg?: number
  bmr_kcal?: number
  daily_kcal?: number
  optimal_weight_kg?: number
  /** Границы нормы и сегментарный анализ из отчёта — хранятся как есть. */
  norms?: Partial<Record<string, { min: number; max: number }>>
  muscle_segments?: Record<string, { kg: number; pct?: number; status?: string }>
  fat_segments?: Record<string, { kg: number; pct?: number; status?: string }>

  /** Откуда замер: ручной ввод или импортированный отчёт. */
  source?: 'manual' | 'inbody'
  source_file?: string

  logged_at: number
  updated_at: number
}

export type Role = 'CLIENT' | 'TRAINER'

/**
 * Аккаунт. В прототипе в одной базе живут несколько аккаунтов, между
 * которыми можно переключаться — так связку тренер↔клиент видно без сервера.
 * В проде это ровно одна запись, приходящая с бэкенда после авторизации.
 */
export interface UserProfile {
  id: string
  name: string
  role: Role
  gender?: 'м' | 'ж'
  birth_year?: number
  height_cm?: number
  goal_weight_kg?: number
  experience?: 'Новичок' | 'Средний' | 'Продвинутый'
  /** Только для тренера: специализация и описание в карточке. */
  specialization?: string
  bio?: string
  plan: 'FREE' | 'PRO'
  default_rest_seconds: number
  haptics_enabled: 0 | 1
  sound_enabled: 0 | 1
  updated_at: number
}

/** Активный аккаунт устройства. Единственная строка с id = 'state'. */
export interface AppState {
  id: string
  active_user_id: string
  /** Пройден ли первый запуск. 0 — показываем онбординг. */
  onboarded?: 0 | 1
  /** Тема оформления. 'auto' — следовать системной настройке. */
  theme?: ThemePref
  /** Акцентный цвет интерфейса. */
  accent?: AccentPref
}

export type ThemePref = 'auto' | 'light' | 'dark'
export type AccentPref = 'lime' | 'indigo'

export type LinkStatus = 'PENDING' | 'ACTIVE' | 'PAUSED'

/** Связь тренера и клиента. */
export interface TrainerLink {
  id: string
  trainer_id: string
  client_id: string
  status: LinkStatus
  /** Кто инициировал связь — влияет на то, кому показывать подтверждение. */
  initiated_by: Role
  created_at: number
  updated_at: number
}

/** Одноразовый код приглашения, который тренер передаёт клиенту. */
export interface Invite {
  code: string
  trainer_id: string
  created_at: number
  expires_at: number
  used_by?: string
  used_at?: number
}

/** Один пункт расписания: какой день программы на какой день недели. */
export interface ScheduleSlot {
  /** 0 — понедельник, 6 — воскресенье. */
  weekday: number
  routine_id: string
}

/**
 * Программа, назначенная тренером клиенту на срок и по дням недели.
 * Расписание задаёт, какой тренировочный день приходится на какой день
 * недели, поэтому плановое количество тренировок — это его длина.
 */
export interface Assignment {
  id: string
  trainer_id: string
  client_id: string
  program_id: string
  /**
   * Плановое число тренировок в неделю. Для назначений с расписанием
   * равно его длине; поле оставлено ради назначений, созданных до него.
   */
  weekly_target: number
  /** Пусто у старых назначений — тогда план работает без привязки к дням. */
  schedule?: ScheduleSlot[]
  /** Сколько недель программа актуальна. */
  weeks?: number
  note?: string
  start_at: number
  end_at?: number
  status: 'ACTIVE' | 'DONE' | 'CANCELLED'
  updated_at: number
}

/** Приватная заметка тренера о клиенте. Клиенту не видна. */
export interface TrainerNote {
  id: string
  trainer_id: string
  client_id: string
  text: string
  created_at: number
  updated_at: number
}

/**
 * Комментарий тренера. Без exercise_id — общий к тренировке,
 * с exercise_id — разбор конкретного упражнения (обычно по видео).
 */
export interface Feedback {
  id: string
  trainer_id: string
  client_id: string
  session_id: string
  exercise_id?: string
  text: string
  created_at: number
  is_read: 0 | 1
  updated_at: number
}

/* ------------------------------- питание ------------------------------ */

export type NutritionGoal = 'lose' | 'maintain' | 'gain'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** Значения нутриентов на порцию. Всё в граммах, энергия в ккал. */
export interface Nutrients {
  kcal: number
  protein: number
  fat: number
  carbs: number
  fiber?: number
  sugar?: number
  sodium?: number
}

/** Настройки питания пользователя. Отдельно от профиля: они меняются чаще. */
export interface NutritionProfile {
  id: string
  goal: NutritionGoal
  /** Коэффициент активности для стартовой оценки, пока нет своих данных. */
  activity: number
  /** Доли белка/жира/углеводов от калорийности, в сумме единица. */
  macro_split: { protein: number; fat: number; carbs: number }
  /** Расход, рассчитанный алгоритмом. Пока данных мало — оценка по формуле. */
  current_tdee?: number
  /** Ручная поправка расхода для тех, кто ведёт счёт сам. */
  manual_offset?: number
  /**
   * Цели, назначенные тренером. Заданы — перекрывают расчёт: если тренер
   * поставил норму, приложение не должно спорить с ним своей математикой.
   */
  coach_kcal?: number
  coach_macros?: { protein: number; fat: number; carbs: number }
  coach_id?: string
  coach_note?: string
  /** Скорость изменения веса, кг в неделю: сколько дефицита или профицита держим. */
  weekly_change_kg?: number
  updated_at: number
}

/**
 * Запись съеденного. Нутриенты сохраняются слепком: производители меняют
 * рецептуры, и подтягивать их заново означало бы задним числом менять
 * историю пользователя и ломать расчёт расхода.
 */
export interface FoodLog {
  id: string
  user_id: string
  /** Локальная дата пользователя, YYYY-MM-DD — по ней собирается день. */
  date: string
  /** Часовой пояс на момент записи: без него перелёт смещает дни. */
  timezone: string
  slot: MealSlot
  food_id?: string
  name: string
  brand?: string
  /** Сколько граммов или миллилитров съедено. */
  amount: number
  unit: 'г' | 'мл' | 'шт'
  /** Слепок нутриентов на съеденное количество, не на 100 г. */
  nutrients: Nutrients
  logged_at: number
  updated_at: number
}

/** Кеш продуктов: найденное однажды должно открываться и без сети. */
export interface FoodItem {
  id: string
  name: string
  brand?: string
  barcode?: string
  /** Нутриенты на 100 г или 100 мл. */
  per100: Nutrients
  unit: 'г' | 'мл'
  /** Типичная порция, если поставщик её указал. */
  serving_size?: number
  serving_label?: string
  source: 'off' | 'manual'
  image_url?: string
  used_at: number
  updated_at: number
}

export type ChatKind = 'text' | 'voice' | 'circle' | 'file' | 'image'

/**
 * Сообщение переписки тренера и клиента. Медиа хранится Blob-ом рядом с
 * сообщением: прототип работает без сервера, а голосовое должно оставаться
 * доступным офлайн так же, как и текст.
 */
export interface ChatMessage {
  id: string
  /** Ключ диалога — пара тренер+клиент, чтобы выбирать одним индексом. */
  thread_id: string
  trainer_id: string
  client_id: string
  author_id: string
  author_role: Role
  kind: ChatKind
  text?: string
  blob?: Blob
  mime?: string
  size?: number
  /** Длительность голосового или кружка в секундах. */
  duration?: number
  file_name?: string
  /** Огибающая громкости для отрисовки голосового без перечитывания файла. */
  waveform?: number[]
  created_at: number
  is_read: 0 | 1
  updated_at: number
}

/** Идентификатор диалога строится из пары участников. */
export const threadId = (trainerId: string, clientId: string) => `${trainerId}::${clientId}`

/**
 * Видео техники, снятое клиентом. Файл лежит в IndexedDB как Blob —
 * это работает офлайн и не требует загрузки на сервер в прототипе.
 * В проде сюда встаёт ссылка на объектное хранилище.
 */
export interface Attachment {
  id: string
  user_id: string
  session_id: string
  exercise_id: string
  kind: 'video' | 'photo'
  blob: Blob
  mime: string
  size: number
  created_at: number
  updated_at: number
}

/** Очередь исходящих мутаций для будущей фоновой синхронизации с REST API. */
export interface SyncQueueItem {
  id: string
  entity: string
  entity_id: string
  op: 'create' | 'update' | 'delete'
  payload: unknown
  created_at: number
  attempts: number
}

class TrainerDB extends Dexie {
  exercises!: Table<Exercise, string>
  programs!: Table<Program, string>
  routines!: Table<WorkoutRoutine, string>
  templateItems!: Table<WorkoutTemplateItem, string>
  sessions!: Table<WorkoutSession, string>
  sets!: Table<ExerciseSet, string>
  bodyMetrics!: Table<BodyMetric, string>
  profile!: Table<UserProfile, string>
  syncQueue!: Table<SyncQueueItem, string>
  appState!: Table<AppState, string>
  links!: Table<TrainerLink, string>
  invites!: Table<Invite, string>
  assignments!: Table<Assignment, string>
  trainerNotes!: Table<TrainerNote, string>
  feedback!: Table<Feedback, string>
  attachments!: Table<Attachment, string>
  chat!: Table<ChatMessage, string>
  nutritionProfile!: Table<NutritionProfile, string>
  foodLogs!: Table<FoodLog, string>
  foods!: Table<FoodItem, string>

  constructor() {
    super('trainer_db')
    this.version(1).stores({
      exercises: 'id, name, muscle_group, equipment, is_custom',
      programs: 'id, author_id, goal, is_public',
      routines: 'id, program_id, day_order',
      templateItems: 'id, routine_id, exercise_id, sequence_order',
      sessions: 'id, user_id, routine_id, start_time, is_completed',
      sets: 'id, workout_session_id, exercise_id, [workout_session_id+sequence_order]',
      bodyMetrics: 'id, user_id, logged_at',
      profile: 'id',
      syncQueue: 'id, entity, created_at',
    })

    // v2 — роли, несколько аккаунтов и связка тренер↔клиент.
    this.version(2)
      .stores({
        profile: 'id, role',
        appState: 'id',
        links: 'id, trainer_id, client_id, status, [trainer_id+client_id]',
        invites: 'code, trainer_id, used_by',
        assignments: 'id, trainer_id, client_id, program_id, status',
        trainerNotes: 'id, [trainer_id+client_id], created_at',
        feedback: 'id, client_id, session_id, [trainer_id+client_id], is_read',
      })
      .upgrade(async (tx) => {
        // Существующий единственный профиль становится аккаунтом клиента.
        await tx
          .table<UserProfile>('profile')
          .toCollection()
          .modify((p) => {
            if (!p.role) p.role = 'CLIENT'
          })
        await tx.table<AppState>('appState').put({ id: 'state', active_user_id: LOCAL_USER_ID })
      })

    // v3 — видео техники и покомментарийный разбор упражнений.
    this.version(3).stores({
      programs: 'id, author_id, goal, is_public, client_id',
      attachments: 'id, user_id, session_id, exercise_id, [session_id+exercise_id]',
      feedback:
        'id, client_id, session_id, exercise_id, [trainer_id+client_id], [session_id+exercise_id], is_read',
    })

    // v4 — переписка тренера и клиента с голосовыми, кружками и файлами.
    this.version(4).stores({
      chat: 'id, thread_id, created_at, [thread_id+created_at], [thread_id+is_read]',
    })

    // v5 — модуль питания: дневник, кеш продуктов и настройки расхода.
    this.version(5).stores({
      nutritionProfile: 'id',
      foodLogs: 'id, user_id, date, [user_id+date], logged_at',
      foods: 'id, barcode, name, used_at',
    })

    /**
     * v6 повторяет схему питания намеренно. В одной из сборок версии
     * объявлялись не по возрастанию, и у части устройств база записалась
     * как пятая, но без таблиц дневника. Dexie не переприменяет схему при
     * том же номере, поэтому нужен новый — иначе эти устройства остаются
     * со сломанным модулем навсегда.
     */
    this.version(6).stores({
      nutritionProfile: 'id',
      foodLogs: 'id, user_id, date, [user_id+date], logged_at',
      foods: 'id, barcode, name, used_at',
    })

  }
}

export const db = new TrainerDB()

export const LOCAL_USER_ID = 'local-user'
export const APP_STATE_ID = 'state'

/**
 * Идентификатор активного аккаунта. Держим в памяти, чтобы синхронные
 * места кода не тянули await, и обновляем при каждом переключении.
 */
let activeUserId = LOCAL_USER_ID

export function currentUserId(): string {
  return activeUserId
}

export async function loadActiveUser(): Promise<string> {
  const state = await db.appState.get(APP_STATE_ID)
  if (state?.active_user_id) {
    const exists = await db.profile.get(state.active_user_id)
    if (exists) {
      activeUserId = state.active_user_id
      return activeUserId
    }
  }
  activeUserId = LOCAL_USER_ID
  await db.appState.put({ id: APP_STATE_ID, active_user_id: activeUserId })
  return activeUserId
}

export async function setActiveUser(userId: string) {
  activeUserId = userId
  const state = await db.appState.get(APP_STATE_ID)
  await db.appState.put({ ...state, id: APP_STATE_ID, active_user_id: userId })
}

/**
 * Тема применяется атрибутом на <html>, а не классом на приложении:
 * так её видят и системные элементы вроде цвета скроллбара.
 */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)

  // Цвет статус-бара в установленном приложении должен совпадать с фоном.
  const dark =
    pref === 'dark' ||
    (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0c0f13' : '#f6f7f9')
}

/**
 * Акцент выставляется атрибутом на <html> — так же, как тема, и по той же
 * причине: переменные должны перекрываться до отрисовки, без вспышки
 * прежнего цвета.
 */
export function applyAccent(pref: AccentPref) {
  const root = document.documentElement
  if (pref === 'lime') root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', pref)
}

export async function getAccentPref(): Promise<AccentPref> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.accent ?? 'lime'
}

export async function setAccentPref(accent: AccentPref) {
  const state = await db.appState.get(APP_STATE_ID)
  await db.appState.put({
    id: APP_STATE_ID,
    active_user_id: state?.active_user_id ?? activeUserId,
    onboarded: state?.onboarded,
    theme: state?.theme,
    accent,
  })
  applyAccent(accent)
}

export async function getThemePref(): Promise<ThemePref> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.theme ?? 'auto'
}

export async function setThemePref(theme: ThemePref) {
  const state = await db.appState.get(APP_STATE_ID)
  await db.appState.put({
    id: APP_STATE_ID,
    active_user_id: state?.active_user_id ?? activeUserId,
    onboarded: state?.onboarded,
    accent: state?.accent,
    theme,
  })
  applyTheme(theme)
}

export async function isOnboarded(): Promise<boolean> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.onboarded === 1
}

export async function markOnboarded() {
  const state = await db.appState.get(APP_STATE_ID)
  await db.appState.put({
    id: APP_STATE_ID,
    active_user_id: state?.active_user_id ?? activeUserId,
    theme: state?.theme,
    accent: state?.accent,
    onboarded: 1,
  })
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const now = () => Date.now()

/**
 * Ставит мутацию в локальную очередь. В проде очередь разбирает
 * Service Worker (Workbox Background Sync) при появлении сети.
 */
export async function enqueue(
  entity: string,
  entity_id: string,
  op: SyncQueueItem['op'],
  payload: unknown,
) {
  await db.syncQueue.add({
    id: uid(),
    entity,
    entity_id,
    op,
    payload,
    created_at: now(),
    attempts: 0,
  })
}
