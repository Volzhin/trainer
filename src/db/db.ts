import Dexie, { type Table } from 'dexie'
import { setLang, type Lang } from '../lib/i18n'

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
  /**
   * Из какого шаблона сделана копия. Программу, назначенную клиенту,
   * копируют под него (иначе она до него не доедет), и без этой ссылки
   * повторное назначение того же шаблона делало бы копию за копией.
   */
  source_id?: string
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
  /**
   * Нижняя граница диапазона повторений — она же единственное значение,
   * когда диапазона нет. Так старые шаблоны читаются без переписывания:
   * «10» и «10-10» это одно и то же.
   */
  target_reps?: number
  /**
   * Верхняя граница. Пусто — цель ровно target_reps.
   *
   * Диапазон нужен потому, что им и разговаривают: «8-12 в подходе»
   * означает работать в этом коридоре и добавлять вес, когда дотянул до
   * верха. Одно число заставляет тренера либо врать, либо объяснять
   * словами в комментарии, где клиент это не прочитает.
   */
  target_reps_max?: number
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
  /**
   * Обхват шеи. Живёт рядом с ростом, а не в замерах: он нужен формуле
   * процента жира, но сам почти не меняется — заставлять мерить его при
   * каждом взвешивании значит собирать один и тот же сантиметр заново.
   */
  neck_cm?: number
  goal_weight_kg?: number
  experience?: 'Новичок' | 'Средний' | 'Продвинутый'
  /** Только для тренера: специализация и описание в карточке. */
  specialization?: string
  bio?: string
  /** Куда писать: ссылки ведут прямо в чат в выбранном мессенджере. */
  contacts?: Contact[]
  /** Предпочтительный способ связи — показывается первым и крупно. */
  preferred_contact?: ContactKind
  /**
   * Программы каталога, отмеченные звёздочкой. Живут в профиле, а не в
   * отдельной таблице: список короткий, меняется редко и уезжает на сервер
   * вместе с профилем — заводить ради него новую сущность и правило доступа
   * значит платить схемой за пять идентификаторов.
   */
  favorite_programs?: string[]
  plan: 'FREE' | 'PRO'
  default_rest_seconds: number
  haptics_enabled: 0 | 1
  sound_enabled: 0 | 1
  /**
   * Уведомления по типам. Живут в профиле рядом со звуком и вибрацией, а не
   * отдельной таблицей: это такие же настройки устройства, и ради пяти
   * переключателей заводить сущность с правилом доступа незачем.
   * Отсутствующий ключ означает «включено» — молчать по умолчанию значит
   * не напомнить человеку о том, ради чего он и пришёл.
   */
  notifications?: Partial<Record<NotificationKind, boolean>>
  updated_at: number
}

/** Типы напоминаний. Каждый отключается отдельно. */
export type NotificationKind =
  'weight' | 'measurements' | 'nutrition_report' | 'workout_report' | 'payment'

/** Включено ли напоминание. Умолчание — да. */
export const notificationOn = (
  profile: Pick<UserProfile, 'notifications'> | null | undefined,
  kind: NotificationKind,
): boolean => profile?.notifications?.[kind] !== false

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
  /** Язык интерфейса. Хранится на устройстве, а не в профиле: язык — это
   *  про того, кто держит телефон, а не про аккаунт. */
  lang?: Lang
  /**
   * Метки обмена по каждому аккаунту. Именно по аккаунту, а не по
   * устройству: на общем телефоне вторая учётная запись со старыми
   * данными иначе никогда бы их не выгрузила — её строки оказались бы
   * «старее» чужого курсора.
   */
  cursors?: Record<
    string,
    {
      /** Устаревшая отметка забора по часам автора — см. pullCursor в sync.ts. */
      pulled?: number
      /** Отметка забора по часам сервера (поле seq). */
      pulledSeq?: number
      pushed?: number
    }
  >
}

export type ThemePref = 'auto' | 'light' | 'dark'
export type AccentPref = 'lime' | 'indigo'

export type ContactKind = 'telegram' | 'whatsapp' | 'max' | 'phone' | 'email'

/** Контакт для связи. Хранится как ввёл человек, нормализуется при показе. */
export interface Contact {
  kind: ContactKind
  value: string
}

export type LinkStatus = 'PENDING' | 'ACTIVE' | 'PAUSED'

/**
 * Режим работы с клиентом. Онлайн — полный цикл отчётности с видео-отчётами,
 * очно — упрощённый: тренер и так видит технику своими глазами.
 */
export type ClientMode = 'online' | 'offline'

/** Связь тренера и клиента. */
export interface TrainerLink {
  id: string
  trainer_id: string
  client_id: string
  status: LinkStatus
  /**
   * Режим выбирает тренер после того, как клиент ввёл код. Пусто у связей,
   * заведённых до появления поля: они читаются как онлайн, потому что до
   * сих пор видео-отчёт был доступен всем и молча отобрать его нельзя.
   */
  mode?: ClientMode
  /** Кто инициировал связь — влияет на то, кому показывать подтверждение. */
  initiated_by: Role
  /** Даты оплат ведёт тренер: приложение денег не принимает. */
  paid_at?: number
  next_payment_at?: number
  /**
   * Подписанные согласия. Без них связи нет — храним отметку времени и
   * версию текста: согласие «когда-то вообще» юридически ничего не значит,
   * а тексты меняются.
   */
  consents?: Consent[]
  created_at: number
  updated_at: number
}

export type ConsentKind = 'offer' | 'personal_data'

export interface Consent {
  kind: ConsentKind
  /** Версия текста, под которой подписались. */
  version: string
  signed_at: number
}

/** Режим связи с учётом старых записей без поля. */
export const modeOf = (link: Pick<TrainerLink, 'mode'> | null | undefined): ClientMode =>
  link?.mode ?? 'online'

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

/** Что делать с весом в следующий раз. */
export type Progression = 'decrease' | 'keep' | 'increase'

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
  /**
   * Рекомендация по весу. Есть только у разбора упражнения: к тренировке
   * целиком она бессмысленна — вес меняют не всем подряд, а точечно.
   */
  progression?: Progression
  created_at: number
  is_read: 0 | 1
  updated_at: number
}

/* ------------------------------- отчёты ------------------------------- */

/**
 * Стадия отчёта — ровно два значения, и это весь список.
 *
 * Проверки тренером здесь нет намеренно: она живёт отдельной записью
 * ReportReview, которая принадлежит тренеру. Клиент такие записи не
 * получает — сервер отдаёт ему только его собственные, — поэтому «проверен»
 * до его устройства не доезжает вообще, а не прячется в интерфейсе.
 *
 * Раньше стадия лежала третьим значением здесь же и срезалась при обмене.
 * Так было нельзя: строка отчёта принадлежит клиенту, и его правка задним
 * числом затирала бы отметку тренера — побеждает более поздняя запись.
 */
export type ReportStatus = 'not_submitted' | 'submitted'

/** Отчёт по тренировке: то, что клиент сдал сам. */
export interface WorkoutReport {
  id: string
  user_id: string
  session_id: string
  status: ReportStatus
  /** Что клиент написал, сдавая тренировку. */
  client_comment?: string
  submitted_at?: number
  /**
   * Ответ тренера прежних версий. Новые ложатся в ReportReply — здесь они
   * жили в одной строке с отчётом клиента, и обмен, разбирающий конфликты
   * строкой целиком, стирал ими правку клиента или терял их сам. Поле
   * оставлено, чтобы уже полученные ответы не пропали с экранов.
   */
  trainer_comment?: string
  /**
   * Когда напомнить о несданном отчёте. Ставится, когда клиент отложил сдачу
   * кнопкой «напомнить позже».
   *
   * Поле без индекса: несданных отчётов у человека единицы, и перебрать их
   * дешевле, чем держать индекс ради одной выборки. Отдельная таблица
   * напоминаний тем более не нужна — напоминание живёт ровно столько, сколько
   * отчёт остаётся несданным, и умирает вместе с ним.
   */
  remind_at?: number
  updated_at: number
}

/**
 * Ответ тренера на отчёт.
 *
 * Отдельной строкой, а не полем в отчёте клиента: обмен решает конфликты
 * сравнением меток у всей строки, поэтому в общей строке побеждает тот, кто
 * записал последним, — клиент, пересдавший отчёт, затирает разбор тренера, а
 * ответ, написанный офлайн, не доезжает вовсе. Здесь у каждой стороны своя
 * строка, и затирать друг друга им нечем.
 *
 * Принадлежит клиенту (ему адресовано), автор — тренер.
 */
export interface ReportReply {
  /** id отчёта о тренировке либо `${clientId}:${YYYY-MM-DD}` для дня питания. */
  id: string
  client_id: string
  trainer_id: string
  target: ReviewTarget
  text: string
  created_at: number
  updated_at: number
}

/** Что именно проверено. */
/**
 * Что именно проверено.
 *
 * Только тренировка и день питания. Замеры, вес, шаги и сон разбору не
 * подлежат: это измерения, а не отчёт о сделанном. Обсуждать в них нечего
 * — они просто складываются в статистику, по которой тренер и судит.
 */
export type ReviewTarget = 'workout' | 'nutrition'

/**
 * Отметка тренера о проверке отчёта. Только факт и время — ничего больше.
 *
 * Принадлежит тренеру и к клиенту не уезжает: правило доступа на сервере
 * отдаёт человеку только его собственные записи и записи его клиентов.
 * Ответ тренера сюда не кладётся — он адресован клиенту и лежит на самом
 * отчёте. Здесь остаётся ровно то, чего клиенту знать не нужно: разобрали
 * его отчёт или он ещё в очереди.
 */
export interface ReportReview {
  id: string
  trainer_id: string
  client_id: string
  target: ReviewTarget
  /** Идентификатор отчёта о тренировке или день питания (YYYY-MM-DD). */
  ref: string
  reviewed_at: number
  updated_at: number
}

/**
 * День дневника питания. Отдельно от записей еды: сытость, комментарий и
 * стадия отчёта относятся к дню целиком, а не к отдельной котлете.
 */
export interface NutritionDay {
  id: string
  user_id: string
  /** Локальная дата, YYYY-MM-DD — тот же ключ, что у записей еды. */
  date: string
  /** 5 — сытый, 1 — очень голодный. */
  satiety?: 1 | 2 | 3 | 4 | 5
  /**
   * Итог дня, введённый рукой.
   *
   * Пока полной базы продуктов нет, человек считает КБЖУ в стороннем
   * приложении и переносит четыре числа сюда. Дневник по продуктам от
   * этого не отменяется: если день собран из записей, эти поля пусты, и
   * тренер видит посчитанное приложением.
   */
  manual?: { kcal?: number; protein?: number; fat?: number; carbs?: number }
  comment?: string
  status: ReportStatus
  submitted_at?: number
  /** Ответ тренера — клиенту видно, см. WorkoutReport.trainer_comment. */
  trainer_comment?: string
  updated_at: number
}

/**
 * Недельные рекомендации тренера.
 *
 * Все поля необязательны: пустое означает, что по этой метрике цели нет и
 * приложение не должно её рисовать. Ноль и «не задано» — разные вещи, и
 * подставлять расчётное значение вместо пропуска нельзя.
 */
export interface NutritionTarget {
  id: string
  client_id: string
  trainer_id: string
  /** Понедельник недели, на которую выданы цели. */
  week_start: number
  /**
   * Тот же понедельник календарной датой. Метка времени зависит от пояса
   * устройства, а неделя — нет: без общего ключа цели тренера доезжали бы к
   * клиенту в другом поясе только со следующей недели.
   */
  week_key?: string
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  steps?: number
  note?: string
  created_at: number
  updated_at: number
}

/**
 * Шаги и сон за день.
 *
 * Только ручной ввод: у веб-приложения нет доступа к Apple Health и Google
 * Fit. Поле source оставлено под будущий импорт из нативной обёртки —
 * см. lib/health.ts.
 */
export interface DailyActivity {
  id: string
  user_id: string
  date: string
  steps?: number
  sleep_minutes?: number
  source: 'manual' | 'import'
  updated_at: number
}

/**
 * Задание клиенту.
 *
 * Не путать с Assignment: там назначенная программа, здесь поручение —
 * анкета, эссе, замеры. Обязательные заводятся при привязке к тренеру и
 * висят на главной, пока не выполнены.
 */
export type TaskKind = 'intake' | 'essay' | 'photos' | 'measurements' | 'inbody' | 'custom'
export type TaskStatus = 'open' | 'done'

export interface ClientTask {
  id: string
  client_id: string
  trainer_id: string
  kind: TaskKind
  title: string
  description?: string
  due_at?: number
  status: TaskStatus
  /** Ответ клиента — для эссе это его текст. */
  answer?: string
  completed_at?: number
  /** Обязательные задания нельзя отложить: они выданы при старте работы. */
  required: 0 | 1
  /**
   * Когда тренер принял выполненное задание.
   *
   * Отдельным полем, а не третьим значением статуса: `status` лежит в
   * индексе и в парном ключе `[client_id+status]`, по которым считают
   * невыполненное. Третье значение пришлось бы учесть в каждом таком месте,
   * а вопрос «сдано ли» и вопрос «принято ли» — разные, и первый принадлежит
   * клиенту, второй тренеру.
   */
  accepted_at?: number
  created_at: number
  updated_at: number
}

/**
 * Заготовка задания у тренера.
 *
 * Задания повторяются от клиента к клиенту — анкета, эссе, замеры перед
 * стартом. Набирать один и тот же текст заново тренер не должен, поэтому
 * шаблон принадлежит ему и в задание только копируется: правка шаблона не
 * должна менять формулировку у тех, кому его уже выдали.
 */
export interface TaskTemplate {
  id: string
  trainer_id: string
  title: string
  description?: string
  /** Через сколько дней срок по умолчанию. Пусто — без срока. */
  due_days?: number
  created_at: number
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
  /**
   * Кто создал продукт. Заполняется только у своих (source: 'manual') —
   * кешу из внешней базы владелец не нужен, он общий для всех аккаунтов.
   */
  creator_id?: string
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
  /** К какой тренировке приложено. Пусто у скриншотов дня питания. */
  session_id?: string
  exercise_id?: string
  /**
   * День питания (YYYY-MM-DD), если это скриншот дневника из другого
   * приложения. Своей таблицы им заводить незачем: у вложений уже есть
   * отдельный путь выгрузки файлов, а json-синхронизация Blob не возит.
   */
  nutrition_date?: string
  /**
   * Документ тренера — оферта или согласие на обработку данных.
   *
   * Лежит там же, где видео и скриншоты: это файл, а у вложений есть
   * собственный путь выгрузки. Обычная синхронизация возит json и Blob не
   * увезёт.
   */
  doc_kind?: ConsentKind
  /** Задание, к которому приложен файл, — например фото до/после. */
  task_id?: string
  /**
   * Ракурс съёмки. Нужен только фото тела: четыре кадра одинаковы по типу и
   * различаются лишь тем, с какой стороны сняты, а без подписи сравнивать их
   * через месяц бесполезно.
   */
  pose?: 'front' | 'side_left' | 'side_right' | 'back'
  kind: 'video' | 'photo' | 'document'
  /** Оригинал на устройстве. У приехавшего с сервера файла его нет. */
  blob?: Blob
  mime: string
  size: number
  /** Идентификатор записи на сервере — по нему собирается адрес файла. */
  remote_id?: string
  /** Имя файла на сервере. */
  remote_file?: string
  created_at: number
  updated_at: number
}

/** Очередь исходящих мутаций: единственный след, по которому выгрузка
 *  узнаёт об удалениях. */
export interface SyncQueueItem {
  id: string
  entity: string
  entity_id: string
  op: 'create' | 'update' | 'delete'
  payload: unknown
  /**
   * Владелец удалённой строки, если его нельзя вывести из неё самой.
   *
   * Подход принадлежит тренировке, день программы — программе, и владельца
   * выгрузка ищет по родителю. При удалении тренировки целиком родителя к
   * этому моменту уже нет, и удаления подходов молча отбрасывались бы —
   * поэтому владельца запоминаем в момент удаления, пока он ещё известен.
   */
  owner?: string
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
  workoutReports!: Table<WorkoutReport, string>
  reviews!: Table<ReportReview, string>
  nutritionDays!: Table<NutritionDay, string>
  nutritionTargets!: Table<NutritionTarget, string>
  dailyActivity!: Table<DailyActivity, string>
  tasks!: Table<ClientTask, string>
  taskTemplates!: Table<TaskTemplate, string>
  reportReplies!: Table<ReportReply, string>

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

    /**
     * v7 — отчётность: отчёты по тренировкам и дням питания, недельные
     * рекомендации, шаги со сном и задания клиенту.
     *
     * Отчёты индексируются по паре владелец+стадия: тренеру нужен список
     * несданного и непроверенного, и без составного индекса это перебор
     * всей таблицы на каждом открытии карточки клиента.
     */
    this.version(7).stores({
      workoutReports: 'id, user_id, session_id, status, [user_id+status]',
      reviews: 'id, client_id, [client_id+target], [target+ref]',
      nutritionDays: 'id, user_id, date, status, [user_id+date], [user_id+status]',
      nutritionTargets: 'id, client_id, [client_id+week_start]',
      dailyActivity: 'id, user_id, date, [user_id+date]',
      tasks: 'id, client_id, status, [client_id+status]',
    })

    /** v8 — заготовки заданий у тренера. */
    this.version(8).stores({
      taskTemplates: 'id, trainer_id, created_at',
    })

    /**
     * v9 — скриншоты дневника питания. Пока своей базы продуктов нет,
     * клиент считает КБЖУ в стороннем приложении и присылает картинку.
     */
    this.version(9).stores({
      attachments:
        'id, user_id, session_id, exercise_id, nutrition_date, [session_id+exercise_id]',
    })

    /**
     * v10 — ответ тренера на отчёт переезжает в собственную строку.
     * Раньше он лежал внутри строки отчёта клиента, а обмен разбирает
     * конфликты целой строкой: правки двух сторон стирали друг друга.
     */
    this.version(10).stores({
      reportReplies: 'id, client_id, [client_id+target]',
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

export async function getLangPref(): Promise<Lang> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.lang ?? 'ru'
}

/**
 * Записать настройку устройства, сохранив всё остальное.
 *
 * Раньше каждая настройка пересобирала запись поле за полем и роняла те,
 * о которых её автор не знал: смена темы стирала курсоры обмена, и
 * приложение молча перекачивало всё заново. Слияние не даёт забыть поле,
 * появившееся позже.
 */
async function patchState(patch: Partial<AppState>) {
  const state = await db.appState.get(APP_STATE_ID)
  await db.appState.put({
    ...state,
    id: APP_STATE_ID,
    active_user_id: state?.active_user_id ?? activeUserId,
    ...patch,
  })
}

export async function setLangPref(lang: Lang) {
  await patchState({ lang })
  setLang(lang)
}

export async function getAccentPref(): Promise<AccentPref> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.accent ?? 'lime'
}

/**
 * Настройки внешнего вида и признак онбординга лежат в одной строке с
 * курсорами обмена, поэтому пишутся поверх неё целиком, а не переносом
 * знакомых полей: перечислять их поимённо — значит потерять всё, о чём
 * забыли. Стёртые курсоры оборачиваются полной перезагрузкой данных, при
 * которой возвращается локально удалённое.
 */
export async function setAccentPref(accent: AccentPref) {
  await patchState({ accent })
  applyAccent(accent)
}

export async function getThemePref(): Promise<ThemePref> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.theme ?? 'auto'
}

export async function setThemePref(theme: ThemePref) {
  await patchState({ theme })
  applyTheme(theme)
}

export async function isOnboarded(): Promise<boolean> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.onboarded === 1
}

export async function markOnboarded() {
  await patchState({ onboarded: 1 })
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const now = () => Date.now()

/**
 * Ставит мутацию в локальную очередь. Очередь нужна только удалениям:
 * остальное выгрузка находит обходом таблиц по updated_at.
 */
export async function enqueue(
  entity: string,
  entity_id: string,
  op: SyncQueueItem['op'],
  payload: unknown,
  owner?: string,
) {
  await db.syncQueue.add({
    id: uid(),
    entity,
    entity_id,
    op,
    payload,
    owner,
    created_at: now(),
    attempts: 0,
  })
}

/**
 * Удаляет строку так, чтобы удаление доехало до сервера.
 *
 * Выгрузка обходит таблицы по updated_at и видит только то, что есть, —
 * удалённой строки в этом обходе нет по определению. Единственный её след
 * остаётся в очереди, поэтому прямой delete означает: у себя пропало, у
 * тренера осталось, а на новом устройстве вернулось обратно.
 *
 * Имя таблицы должно совпадать с именем в SYNCED (см. db/sync.ts) — по нему
 * выгрузка находит владельца строки.
 *
 * `owner` передают там, где владельца выводят из родителя, а родителя
 * удаляют следом (подходы вместе с тренировкой, дни вместе с программой):
 * к моменту выгрузки искать его уже негде.
 */
export async function deleteSynced(table: string, id: string, owner?: string) {
  const row = await db.table(table).get(id)
  await db.table(table).delete(id)
  if (row) await enqueue(table, id, 'delete', row, owner)
}

/** То же для пачки. Строки читаются до удаления — потом их уже не прочесть. */
export async function deleteManySynced(table: string, ids: string[], owner?: string) {
  if (!ids.length) return
  const rows = (await db.table(table).bulkGet(ids)) as (unknown | undefined)[]
  await db.table(table).bulkDelete(ids)
  for (const [i, row] of rows.entries()) {
    if (row) await enqueue(table, ids[i], 'delete', row, owner)
  }
}
