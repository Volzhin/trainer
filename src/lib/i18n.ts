/**
 * Перевод интерфейса.
 *
 * Словарь, а не библиотека: приложение офлайн-первое, и тянуть ради двух
 * языков пакет с загрузчиками, плюрализацией и форматтерами значит платить
 * килобайтами на слабом вайфае в зале за то, что здесь делают тридцать
 * строк.
 *
 * Ключ — русская фраза. Так недостающий перевод не превращается в
 * `settings.notifications.title` на экране: непереведённое просто остаётся
 * по-русски, и это худшее, что может случиться. Заодно не нужно
 * придумывать имена сотням строк и держать их в голове.
 */

export type Lang = 'ru' | 'en'

/**
 * Английские соответствия. Пусто — значит ещё не переведено, показываем
 * русский оригинал.
 *
 * Длина имеет значение: английский в интерфейсе обычно короче русского, но
 * не всегда — «Отдых» против «Rest between sets». Там, где строка стоит в
 * узком месте (вкладка, чип, кнопка в ряду), выбран короткий вариант, даже
 * если полный точнее.
 */
const EN: Record<string, string> = {
  /* --- нижнее меню: место жёстко ограничено, слова только короткие --- */
  Тренировки: 'Workouts',
  Питание: 'Nutrition',
  Чат: 'Chat',
  Отчёты: 'Reports',
  Профиль: 'Profile',
  Клиенты: 'Clients',
  Программы: 'Programs',

  /* --- настройки --- */
  Настройки: 'Settings',
  'Приложение и данные': 'App and data',
  'Кабинет тренера': 'Trainer cabinet',
  Оформление: 'Appearance',
  Тема: 'Theme',
  Язык: 'Language',
  Русский: 'Russian',
  Английский: 'English',
  Тренировка: 'Workout',
  'Отдых по умолчанию': 'Default rest',
  'Если в шаблоне не задан свой': 'When the template has none',
  Вибрация: 'Vibration',
  'Отклик при подтверждении подхода': 'Feedback when a set is confirmed',
  'Звук таймера': 'Timer sound',
  'Сигнал в конце отдыха': 'Signal when rest ends',
  Уведомления: 'Notifications',
  'Разрешение браузера': 'Browser permission',
  'Без него не придёт даже сигнал таймера': 'Without it even the timer stays silent',
  Выдано: 'Granted',
  Разрешить: 'Allow',
  Напоминания: 'Reminders',
  'Внести вес': 'Log weight',
  'Каждый день в 08:00': 'Every day at 08:00',
  'Внести замеры': 'Log measurements',
  'Воскресенье 20:00 и понедельник 08:00': 'Sunday 20:00 and Monday 08:00',
  'Сдать отчёт по питанию': 'Submit nutrition report',
  'Каждый день в 22:00': 'Every day at 22:00',
  'Сдать отчёт по тренировке': 'Submit workout report',
  'Через 4 часа после тренировки, если не сдан':
    'Four hours after a workout, if not submitted',
  'Напоминание об оплате': 'Payment reminder',
  'За 3 дня до даты оплаты': 'Three days before the due date',
  Данные: 'Data',
  'Тренировок сохранено': 'Workouts stored',
  Хранилище: 'Storage',
  Приложение: 'App',
  Браузер: 'Browser',
  онлайн: 'online',
  оффлайн: 'offline',
  'в очереди': 'queued',
  'Выгрузить историю в CSV': 'Export history to CSV',
  'Демо-режим': 'Demo data',
  'Заполнить дневник примером за 10 недель': 'Fill the diary with 10 sample weeks',
  'Как это работает': 'How it works',
  Аккаунт: 'Account',
  'Переключить аккаунт': 'Switch account',
  'Восстановить каталог упражнений': 'Restore exercise catalogue',
  'Очистить историю тренировок': 'Clear workout history',
  'Свои тренировки': 'My own workouts',
  'Работа с клиентами': 'Working with clients',
  'Перейти к своим тренировкам': 'Switch to my own workouts',
  'Перейти в режим тренера': 'Switch to trainer mode',
  'Клиенты, программы и разбор отчётов': 'Clients, programs and report reviews',
  Переключить: 'Switch',
  'Переключаю…': 'Switching…',
  'Режим тренера': 'Trainer mode',
  'Свой дневник, замеры и питание. Клиенты останутся на месте — вернуться можно тем же переключателем.':
    'Your own diary, measurements and nutrition. Your clients stay put — the same switch brings you back.',

  /* --- общее: кнопки и состояния, встречаются на каждом экране --- */
  Назад: 'Back',
  Закрыть: 'Close',
  Отмена: 'Cancel',
  Сохранить: 'Save',
  Удалить: 'Delete',
  Готово: 'Done',
  'Загрузка…': 'Loading…',
  Сегодня: 'Today',
  Неделя: 'Week',
  Месяц: 'Month',
  'Всё время': 'All time',
  '4 недели': '4 weeks',
  '12 недель': '12 weeks',
  Вес: 'Weight',
  Тело: 'Body',
  Прогресс: 'Progress',
  Упражнения: 'Exercises',
  Программа: 'Program',
  Заметки: 'Notes',

  /* --- главная и календарь --- */
  Привет: 'Hi',
  Гость: 'Guest',
  'Выберите день и начните тренировку': 'Pick a day and start a workout',
  'за неделю': 'this week',
  'Вернуться к тренировке': 'Back to the workout',
  'от тренера': 'from your trainer',
  'Программа от тренера': 'Program from your trainer',
  Тренер: 'Trainer',
  'осталось': 'left',
  'На этой неделе': 'This week',
  'из': 'of',
  'Открыть программу': 'Open program',
  сегодня: 'today',
  Вперёд: 'Forward',
  'По плану': 'Planned',
  'Нет тренировок в этот день': 'No workouts on this day',
  'Начать тренировку': 'Start a workout',
  'Следующая из программы': 'Next from the program',
  'Свободная тренировка': 'Free workout',
  'Упражнения добавите по ходу': 'Add exercises as you go',
  'Программа не назначена — тренировку из плана запускать пока не из чего.':
    'No program assigned — there is nothing to start from a plan yet.',
  План: 'Plan',
  'В этом дне программы пока нет упражнений': 'This program day has no exercises yet',
  'Тренировка создана по образцу': 'Workout created from that one',
  Повторить: 'Repeat',

  /* --- живая тренировка --- */
  Завершить: 'Finish',
  'Добавить упражнение': 'Add exercise',
  'Добавьте первое упражнение': 'Add your first exercise',
  'Добавить подход': 'Add set',
  'Тренировка не найдена': 'Workout not found',
  'На главную': 'Go home',
  'Укажите вес или повторения': 'Enter weight or reps',
  'Личный рекорд': 'Personal record',
  'Тренировка завершена': 'Workout finished',
  'Тренировка отменена — ни одного подхода': 'Workout discarded — no sets recorded',
  Заменить: 'Replace',
  'Заменить упражнение': 'Replace exercise',
  'Убрать упражнение': 'Remove exercise',
  'Упражнение заменено': 'Exercise replaced',
  'как делать': 'how to do it',
  'прошлый раз': 'last time',
  цель: 'target',
  Лучший: 'Best',
  Последний: 'Last',
  'Как делать': 'How to do it',
  'Статистика по подходам': 'Set statistics',
  Статистика: 'Statistics',
  'Все подходы отмечены': 'All sets are checked',
  'Можно сдать отчёт тренеру. Комментарий необязателен.':
    'You can submit the report. A comment is optional.',
  'Как прошло: самочувствие, что было тяжело':
    'How it went: how you felt, what was hard',
  'Сдать отчёт': 'Submit report',
  'Отправляю…': 'Sending…',
  'Отчёт отправлен тренеру': 'Report sent to your trainer',
  'Нечего отмечать: подходы пустые': 'Nothing to check: the sets are empty',
  'Снизить вес': 'Lower the weight',
  'Оставить вес': 'Keep the weight',
  'Прибавить вес': 'Add weight',
  'Расчётный максимум': 'Estimated max',
  'Это упражнение вы ещё не делали.': 'You have not done this exercise yet.',
  'Видеоотчёт тренеру': 'Video report',

  /* --- отчёты клиента --- */
  'Задания от тренера': 'Tasks from your trainer',
  обязательно: 'required',
  'Шаги и сон за сегодня': 'Steps and sleep today',
  'Видео-отчёты по тренировкам': 'Workout video reports',
  'Сданные отчёты': 'Submitted reports',
  'Показать сданное': 'Show what was submitted',
  'Вес, замеры, InBody, шаги и сон — с возможностью удалить':
    'Weight, measurements, InBody, steps and sleep — each can be deleted',
  'Пока ничего не сдано.': 'Nothing submitted yet.',
  'Запись удалена': 'Entry deleted',
  'Сдать вес': 'Submit weight',
  'ещё не вносили': 'not logged yet',
  последний: 'last',
  'Сдать еженедельные замеры': 'Submit weekly measurements',
  'Обхваты, вес и процент жира вручную': 'Girths, weight and body fat by hand',
  'Сдать InBody': 'Submit InBody',
  'PDF из зала — можно выбрать сразу несколько': 'PDF from the gym — several at once is fine',
  'Открыть дневник': 'Open the diary',
  'Отчёт за день сдаётся под записями о еде': 'The daily report sits under the food entries',
  'Цели на неделю': 'Weekly targets',
  Шаги: 'Steps',
  'Сон, ч': 'Sleep, h',
  'Вес записан': 'Weight saved',
  'Файл сохранён': 'File saved',
  'Вводится вручную — приложению в браузере шаги и сон не отдаёт ни одна система.':
    'Entered by hand — no system gives steps or sleep to a browser app.',
  'Отчёты сдаются тренеру. Код приглашения вводится в профиле.':
    'Reports go to your trainer. Enter an invite code in your profile.',
  ответ: 'reply',
  сдан: 'submitted',
  'не сдан': 'not submitted',

  /* --- программы --- */
  'Готовые сплиты и свои шаблоны': 'Ready splits and your own templates',
  'Моя программа': 'My program',
  Каталог: 'Catalogue',
  'Мои программы': 'My programs',
  Все: 'All',
  'Создать программу': 'Create program',
  'Новая программа': 'New program',
  Название: 'Name',
  Создать: 'Create',
  Начать: 'Start',
  'Здесь появятся программы от тренера и отмеченные звёздочкой в каталоге. Свою можно собрать кнопкой «+».':
    'Programs from your trainer and catalogue ones you starred appear here. Build your own with «+».',
  'В этой категории пусто': 'Nothing in this category',
  'Программа от тренера скоро появится': 'Your trainer’s program will appear soon',
  'Программа удалена': 'Program deleted',
  'Добавить день': 'Add day',
  подходы: 'sets',
  'повторы от': 'reps from',
  до: 'to',
  'отдых, сек': 'rest, sec',
  'Объём за неделю': 'Weekly volume',
  'Всего за неделю': 'Total for the week',
  'День добавлен': 'Day added',

  /* --- кабинет тренера --- */
  Пригласить: 'Invite',
  'Пригласить клиента': 'Invite a client',
  'Код тренера': 'Trainer code',
  'Пока нет клиентов.': 'No clients yet.',
  'Выпустите код приглашения и передайте его клиенту.':
    'Issue an invite code and pass it to your client.',
  'Набор клиентов открывается с подпиской.': 'Recruiting clients requires a subscription.',
  клиентов: 'clients',
  'выпали из графика': 'off schedule',
  'выполнили план недели': 'hit the weekly plan',
  'рекордов за 2 недели': 'records in 2 weeks',
  Список: 'List',
  'тренировок выполнено': 'workouts done',
  'дней по питанию сдано': 'nutrition days submitted',
  'ещё не тренировался': 'has not trained yet',
  'тренировался сегодня': 'trained today',
  'без тренировок': 'without workouts',
  'Назначить программу': 'Assign a program',
  'Подписка не оформлена': 'No subscription',
  'Оформить подписку': 'Get a subscription',
  'Активные коды': 'Active codes',
  'Выпустить новый код': 'Issue a new code',
  'Код скопирован': 'Code copied',
  Скопировать: 'Copy',
  Отозвать: 'Revoke',
  'действует до': 'valid until',

  /* --- карточка клиента --- */
  'Режим работы': 'Working mode',
  Онлайн: 'Online',
  Очно: 'In person',
  Оплата: 'Payment',
  Оплачено: 'Paid on',
  'Следующая оплата': 'Next payment',
  'Требует внимания': 'Needs attention',
  'Всё закрыто: заданий не висит, отчёты разобраны.':
    'All clear: no open tasks, all reports reviewed.',
  'Связь с клиентом': 'Contacting the client',
  Написать: 'Message',
  'Прекратить работу с клиентом': 'End work with this client',
  'опыт не указан': 'experience not set',
  'Сданные тренировки': 'Submitted workouts',
  'Куда уходит нагрузка': 'Where the load goes',
  'Упражнения программы': 'Program exercises',
  'Программа не назначена': 'No program assigned',
  Открыть: 'Open',
  'Дневник по дням': 'Diary by day',
  'Нажмите на день, чтобы прочитать отчёт и ответить клиенту.':
    'Tap a day to read the report and reply to your client.',
  'Цели на эту неделю не выданы.': 'No targets set for this week.',
  'Выдать цели': 'Set targets',
  'Обновить цели': 'Update targets',
  'Цели выданы': 'Targets set',
  'Ждут разбора': 'Awaiting review',
  Задания: 'Tasks',
  'Выдать задание': 'Assign a task',
  'Задание клиенту': 'Task for the client',
  'Что сделать': 'What to do',
  Подробности: 'Details',
  'Из заготовок': 'From templates',
  'Сохранить как заготовку': 'Save as a template',
  Выполнено: 'Done',
  'Не выполнено': 'Not done',
  'Обязательное · не выполнено': 'Required · not done',
  'Отчёт разобран': 'Report reviewed',
  'Заданий нет.': 'No tasks.',
  'ждут разбора': 'awaiting review',
  'заданий не выполнено': 'tasks not done',
  'Клиент пока ничего не сдавал.': 'Your client has not submitted anything yet.',
  проверен: 'reviewed',
  '7 дней': '7 days',
  Практика: 'Practice',
  Подписка: 'Subscription',
  'Подписка активна': 'Subscription active',
  'Отключить подписку': 'Cancel subscription',
  Изменить: 'Edit',
  'Что написал клиент': 'What the client wrote',
  'Ответ клиенту': 'Reply to the client',
  'Что получилось, что меняем к следующему разу':
    'What worked, what we change for next time',
  'За четыре недели подходов не записано.': 'No sets recorded in four weeks.',
  'За четыре недели подходов не записано': 'No sets recorded in four weeks',
  новый: 'new',
  'Например: прислать видео приседа': 'For example: send a video of your squat',
  'Зачем это нужно и как сделать': 'Why it matters and how to do it',
  'Разобрать': 'Review',
  'Отправить': 'Send',
  'Специализация не указана': 'Specialisation not set',

  /* --- дни недели и месяцы: короткие формы, они стоят в узкой сетке --- */
  пн: 'Mon',
  вт: 'Tue',
  ср: 'Wed',
  чт: 'Thu',
  пт: 'Fri',
  сб: 'Sat',
  вс: 'Sun',
  январь: 'January',
  февраль: 'February',
  март: 'March',
  апрель: 'April',
  май: 'May',
  июнь: 'June',
  июль: 'July',
  август: 'August',
  сентябрь: 'September',
  октябрь: 'October',
  ноябрь: 'November',
  декабрь: 'December',
}

/**
 * Множественные числа. Русские формы приходят тройкой, английские — парой,
 * и правила у них разные: «2 тренировки», но «2 workouts».
 *
 * Ключ — первая русская форма: она уже стоит в вызове, и не приходится
 * заводить рядом второй набор идентификаторов.
 */
const PLURAL_EN: Record<string, [string, string]> = {
  тренировка: ['workout', 'workouts'],
  подход: ['set', 'sets'],
  повтор: ['rep', 'reps'],
  день: ['day', 'days'],
  неделя: ['week', 'weeks'],
  задание: ['task', 'tasks'],
  отчёт: ['report', 'reports'],
  клиент: ['client', 'clients'],
  упражнение: ['exercise', 'exercises'],
  запись: ['entry', 'entries'],
  'не сдан': ['not submitted', 'not submitted'],
}

export const pluralEn = (n: number, first: string): string | null => {
  const forms = PLURAL_EN[first]
  return forms ? (Math.abs(n) === 1 ? forms[0] : forms[1]) : null
}

const DICT: Record<Lang, Record<string, string>> = { ru: {}, en: EN }

let current: Lang = 'ru'

export function setLang(lang: Lang) {
  current = lang
  // Атрибут на <html> нужен и для доступности (скринридер выбирает голос),
  // и для переносов: правила расстановки у языков разные.
  document.documentElement.setAttribute('lang', lang)
}

export const getLang = (): Lang => current

/**
 * Перевести строку. Нет перевода — возвращаем как есть.
 *
 * Именно поэтому русский остаётся языком ключей: пропущенная строка
 * выглядит как непереведённая, а не как сломанная.
 */
export function t(ru: string): string {
  return DICT[current][ru] ?? ru
}

/** Сколько строк уже переведено — для честной подписи в настройках. */
export const translatedCount = () => Object.keys(EN).length
