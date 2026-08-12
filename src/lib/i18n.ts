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
