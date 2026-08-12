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
  Срок: 'Due date',
  'Необязательно. С сроком просроченное задание видно обоим.':
    'Optional. With a due date, an overdue task is visible to both of you.',
  просрочено: 'overdue',
  'Шаги и сон за сегодня': 'Steps and sleep today',
  'Видео-отчёты по тренировкам': 'Workout video reports',
  'Сданные отчёты': 'Submitted reports',
  'Все тренировки сданы.': 'All workouts submitted.',
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
  'Тренировки без разбора': 'Workouts to review',
  'Дни питания без разбора': 'Nutrition days to review',
  'Задания не выполнены': 'Tasks not done',
  'Всё закрыто: заданий не висит, отчёты разобраны.':
    'All clear: no open tasks, all reports reviewed.',
  'Связь с клиентом': 'Contacting the client',
  Написать: 'Message',
  'Прекратить работу с клиентом': 'End work with this client',
  'История останется у клиента, вы потеряете к ней доступ. Он сможет подключить другого тренера.':
    'The history stays with the client, you lose access to it. They will be able to connect another trainer.',
  'опыт не указан': 'experience not set',
  'Сданные тренировки': 'Submitted workouts',
  'Куда уходит нагрузка': 'Where the load goes',
  'Упражнения программы': 'Program exercises',
  'Программа не назначена': 'No program assigned',
  Открыть: 'Open',
  Снять: 'Unassign',
  'Программа снята с клиента': 'Program removed from the client',
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
  выполнено: 'done',
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
  Документы: 'Documents',
  Оферта: 'Offer agreement',
  'Согласие на обработку персональных данных': 'Personal data consent',
  'Условия, на которых вы работаете с клиентом': 'The terms you work with clients on',
  'Какие данные вы собираете и зачем': 'What data you collect and why',
  'Клиент подписывает их при подключении. Не прикреплённое не показывается и не подписывается.':
    'Clients sign these when joining. Anything not attached is neither shown nor signed.',
  Прикрепить: 'Attach',
  'Чтобы начать работу с тренером, примите его документы. Нажмите на название, чтобы открыть.':
    'To start working with this trainer, accept their documents. Tap a title to open it.',
  'Тренер не приложил документов — подписывать нечего.':
    'This trainer attached no documents — there is nothing to sign.',
  'открыть документ': 'open the document',
  Принимаю: 'I accept',
  'Принять и подключить тренера': 'Accept and connect',
  'Подключить тренера': 'Connect trainer',
  'Назад к коду': 'Back to the code',
  'Подключаю…': 'Connecting…',
  'Проверяю…': 'Checking…',
  'Код не найден': 'Code not found',
  прикреплён: 'attached',
  'Документ прикреплён': 'Document attached',
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

  /* --- профиль клиента, вход, онбординг --- */
  'Мои данные': 'My data',
  'История тренировок': 'Workout history',
  'Все завершённые тренировки': 'Every finished workout',
  'Анализ тела': 'Body composition',
  'Замеры и отчёты InBody': 'Measurements and InBody reports',
  'План программы, рост весов по упражнениям, рекорды':
    'Program plan, weight growth per exercise, records',
  Имя: 'Name',
  'Рост, см': 'Height, cm',
  'Целевой вес, кг': 'Goal weight, kg',
  'Опыт тренировок': 'Training experience',
  'Где с вами связаться': 'How to reach you',
  Новичок: 'Beginner',
  Средний: 'Intermediate',
  Продвинутый: 'Advanced',
  'Вы здесь как': 'You are here as',
  'Как вас зовут': 'Your name',
  Почта: 'Email',
  Пароль: 'Password',
  'не короче 8 символов': 'at least 8 characters',
  'Посмотреть без регистрации': 'Look around without signing up',
  Войти: 'Sign in',
  Зарегистрироваться: 'Sign up',
  'Как вы будете пользоваться приложением?': 'How will you use the app?',
  'Я тренируюсь': 'I train',
  'Дневник тренировок, программы и прогресс': 'Workout diary, programs and progress',
  'Я тренер': 'I am a trainer',
  'Кабинет с клиентами, программы и обратная связь':
    'Client cabinet, programs and feedback',
  'Показать на примере?': 'Show me an example?',
  Продолжить: 'Continue',
  Пропустить: 'Skip',

  /* --- прогресс --- */
  'на этой неделе': 'this week',
  'в среднем за неделю': 'weekly average',
  'вес, кг в неделю': 'weight, kg per week',
  'поднято всего': 'total lifted',
  подходов: 'sets',
  'За этот период подходов не записано': 'No sets recorded in this period',
  'Нагрузка по неделям': 'Load by week',
  'Нет данных за период': 'No data for this period',
  'Личные рекорды': 'Personal records',
  'Завершите первую тренировку': 'Finish your first workout',
  'Сделано по плану': 'Done as planned',
  'Из программы': 'From the program',
  'Выбрать программу': 'Choose a program',
  'С программой прогресс считается по плану: видно, какие тренировки вы пропустили и какие упражнения растут, а какие стоят.':
    'With a program, progress is measured against the plan: you see the workouts you missed and which exercises grow or stall.',

  /* --- анализ тела --- */
  'Основные параметры': 'Key metrics',
  Другие: 'Other',
  'Анализ тела по сегментам': 'Segment analysis',
  Динамика: 'Trend',
  'Может быть полезным': 'May be useful',
  'Оптимальный вес': 'Optimal weight',
  'Приём калорий': 'Calorie intake',
  Белки: 'Protein',
  Жиры: 'Fat',
  Углеводы: 'Carbs',
  'Улучшение композиции тела': 'Body composition change',
  Жир: 'Fat',
  Мышцы: 'Muscle',
  Замеры: 'Measurements',
  кг: 'kg',
  'Таблица замеров': 'Measurements table',
  'Замеры за 2 недели': 'Measurements, last 2 weeks',
  'Жир расчётный': 'Body fat, estimated',
  'Процент жира посчитан по обхватам — это оценка, а не замер. Диаграмму InBody она не меняет.':
    'Body fat is estimated from girths — an estimate, not a measurement. It does not affect the InBody chart.',
  'Обхват шеи, см': 'Neck, cm',
  'Под кадыком, лента горизонтально. Нужен для расчёта процента жира.':
    'Below the Adam’s apple, tape level. Used to estimate body fat.',
  'Клиент ещё не взвешивался — цели придётся ставить вслепую.':
    'The client has not weighed in yet — targets would be a guess.',
  'за 2 недели': 'last 2 weeks',
  'от старта': 'since start',
  старт: 'start',
  'За две недели новых замеров нет — сравнивать пока не с чем.':
    'No new measurements in two weeks — nothing to compare yet.',
  Талия: 'Waist',
  Грудь: 'Chest',
  Таз: 'Hips',
  Шея: 'Neck',
  Бедро: 'Thigh',
  'без цифр': 'no numbers',

  /* --- дневник питания --- */
  'Настройки питания': 'Nutrition settings',
  'Предыдущий день': 'Previous day',
  'Следующий день': 'Next day',
  Съедено: 'Eaten',
  Осталось: 'Left',
  Превышение: 'Over',
  'Комментарий тренера': 'Trainer’s comment',
  Добавить: 'Add',
  'Мои продукты': 'My foods',
  'Домашние блюда и то, чего нет в базе': 'Home dishes and anything missing from the database',
  Завтрак: 'Breakfast',
  Обед: 'Lunch',
  Ужин: 'Dinner',
  Перекусы: 'Snacks',
  Записано: 'Saved',
  'цель не задана': 'no target set',
  'Отчёт тренеру': 'Report to trainer',
  'Отчёт по питанию': 'Nutrition report',
  'Прикрепить отчёт по питанию': 'Attach a nutrition report',
  'Изменить отчёт': 'Edit the report',
  'КБЖУ числом и скриншот из вашего счётчика':
    'Calories and macros as numbers, plus a screenshot from your tracker',
  'Перенесите итог дня из своего счётчика. Пустое поле останется пустым.':
    'Copy the day’s totals from your tracker. An empty field stays empty.',
  'Добавить скриншот': 'Add a screenshot',
  'За какой день': 'Which day',
  'За этот день отчёт уже сдан — вы его измените.':
    'A report for this day is already submitted — you will edit it.',
  'За этот день уже есть отчёт — вы его измените.':
    'There is already a report for this day — you will edit it.',
  'Скриншот прикреплён': 'Screenshot attached',
  'Отчёт сохранён': 'Report saved',
  'скрин.': 'shots',
  'Сохраняю…': 'Saving…',

  /* --- история, тренировка, упражнения --- */
  История: 'History',
  'Здесь появятся завершённые тренировки.': 'Finished workouts will appear here.',
  длительность: 'duration',
  тоннаж: 'tonnage',
  Заметка: 'Note',
  Видеоотчёт: 'Video report',
  'Разбор техники от тренера': 'Technique review from your trainer',
  'Тренировка удалена': 'Workout deleted',
  'Создать упражнение': 'Create exercise',
  'Поиск: жим, тяга, присед…': 'Search: press, row, squat…',
  'Ничего не нашлось. Можно создать своё упражнение.':
    'Nothing found. You can create your own exercise.',
  своё: 'custom',
  Инвентарь: 'Equipment',
  'Своё упражнение': 'Custom exercise',
  'Например: Тяга Пендлея': 'For example: Pendlay row',
  'Мышечная группа': 'Muscle group',
  Оборудование: 'Equipment',
  'Заметка по технике': 'Technique note',
  Необязательно: 'Optional',

  /* --- статистика недели у тренера --- */
  'Клиент не вводил шаги и сон. Это ручной ввод.':
    'No steps or sleep entered. These are logged by hand.',
  'шагов в среднем': 'steps on average',
  'сна в среднем': 'sleep on average',
  'Вес за две недели': 'Weight over two weeks',
  'Взвешиваний за две недели меньше двух — графика нет.':
    'Fewer than two weigh-ins in two weeks — no chart.',
  'Среднее: прошлая → эта неделя': 'Average: last → this week',
  'Разница по среднему': 'Change in the average',
  'Процент жира по замерам': 'Body fat across measurements',
  'За две недели замеров не было.': 'No measurements in the last two weeks.',
  'В среднем за неделю': 'Weekly average',
  Сон: 'Sleep',
  'Шаги и сон': 'Steps and sleep',
  'За этот день': 'That day',
  'Из счётчика клиента': 'From the client’s tracker',
  'Записей о еде за день нет.': 'No food entries that day.',
  шагов: 'steps',
  дней: 'days',
  Сытость: 'Fullness',
  Комментарий: 'Comment',
  'На чём держим фокус на этой неделе': 'What we focus on this week',
  'Программа не назначена — плана на неделю нет.':
    'No program assigned — there is no weekly plan.',
  'Считается с понедельника.': 'Counted from Monday.',
  'Это ваш ход — клиент уже сдал.': 'Your move — the client has submitted.',
  'Связь с клиентом не найдена.': 'No link with this client.',
  'Дни недели': 'Days of the week',
  'Сколько недель': 'How many weeks',
  'Комментарий клиенту': 'Comment for the client',
  'Например: первые две недели работаем в лёгком темпе':
    'For example: take the first two weeks easy',
  ТРЕНЕР: 'TRAINER',
  'Активных назначений': 'Active assignments',
  'Своих программ': 'Own programs',
  'Профиль тренера': 'Trainer profile',
  'Подписка тренера': 'Trainer subscription',
  Специализация: 'Specialisation',
  'О себе': 'About you',

  /* --- живая тренировка: таблица подходов и завершение --- */
  'повт.': 'reps',
  'Завершить тренировку': 'Finish the workout',
  'Заметка к тренировке': 'Workout note',
  'Самочувствие, техника, что поменять в следующий раз':
    'How you felt, technique, what to change next time',
  'Двойной клик — удалить подход': 'Double tap to delete the set',
  'Подход выполнен': 'Set completed',

  /* --- анализ тела: нормы и ручной ввод --- */
  'Ниже нормы': 'Below range',
  Норма: 'In range',
  'Выше нормы': 'Above range',
  'Границы нормы в отчёте не указаны.': 'The report gives no reference range.',
  'Замер вручную': 'Manual measurement',
  Дата: 'Date',
  'Вес, кг': 'Weight, kg',
  'Обхваты, см': 'Girths, cm',
  'Расчёт по обхватам': 'Estimated from girths',
  'Свой процент жира, если знаете': 'Your body fat, if you know it',

  /* --- расчёт питания и свои продукты --- */
  'Расчёт питания': 'Nutrition maths',
  'расход, ккал': 'expenditure, kcal',
  'цель, ккал': 'target, kcal',
  'Тренд расхода': 'Expenditure trend',
  'Норму назначил тренер': 'Your trainer set the target',
  Цель: 'Goal',
  'Скорость, кг в неделю': 'Pace, kg per week',
  'Распределение макросов': 'Macro split',
  Активность: 'Activity',
  'Ручная поправка': 'Manual adjustment',
  'Борщ домашний': 'Home-made soup',
  'Бренд или уточнение': 'Brand or detail',
  необязательно: 'optional',
  'Считаем на 100': 'Per 100',
  'Белки, г': 'Protein, g',
  'Жиры, г': 'Fat, g',
  'Углеводы, г': 'Carbs, g',
  'Название порции': 'Serving name',
  тарелка: 'bowl',
  Клетчатка: 'Fibre',
  Сахар: 'Sugar',
  'Натрий, мг': 'Sodium, mg',
  'Новый продукт': 'New food',
  Продукт: 'Food',
  'Своя база — она всегда точнее общей': 'Your own list — always more accurate than a shared one',

  /* --- карточка упражнения --- */
  'Техника выполнения': 'How to perform it',
  'Ещё работают': 'Also worked',
  'Другие названия': 'Other names',
  'Прогресс 1ПМ': '1RM progress',
  'Ещё не выполняли это упражнение': 'You have not done this exercise yet',
  '1ПМ': '1RM',

  /* --- аккаунт --- */
  'Войти или зарегистрироваться': 'Sign in or sign up',
  Выйти: 'Sign out',
  'Удалить аккаунт': 'Delete account',
  'Введите слово «удалить», чтобы подтвердить': 'Type «delete» to confirm',
  // Слово подтверждения переводится вместе с подсказкой и проверкой —
  // иначе англоязычному пришлось бы набирать русское слово вслепую.
  удалить: 'delete',
  'Удаляю…': 'Deleting…',
  'Удалить навсегда': 'Delete permanently',

  /* --- остальное: списки, шторки, служебное --- */
  'Аккаунты устройства': 'Accounts on this device',
  активен: 'active',
  'Силовой тренинг, реабилитация': 'Strength training, rehab',
  Штрихкод: 'Barcode',
  'Или введите цифры под кодом': 'Or type the digits under the barcode',
  'левая рука': 'left arm',
  'правая рука': 'right arm',
  'левая нога': 'left leg',
  'правая нога': 'right leg',
  туловище: 'torso',
  Сообщение: 'Message',
  'Черновик документов': 'Draft documents',
  'Предпочтительный способ': 'Preferred way',
  'Что-то сломалось': 'Something broke',
  'Смотреть технику': 'Watch the technique',
  'Поиск по названию': 'Search by name',
  'Ничего не нашлось': 'Nothing found',
  'Упражнение не найдено': 'Exercise not found',
  'Описание техники не заполнено.': 'No technique description yet.',
  Калории: 'Calories',
  'Белки · Жиры · Углеводы': 'Protein · Fat · Carbs',
  'Название продукта': 'Food name',
  'Недостаточно данных': 'Not enough data',
  слева: 'left',
  справа: 'right',
  'Код приглашения': 'Invite code',
  Далее: 'Next',
  'Вы уже работаете с тренером': 'You already work with a trainer',
  'У вас уже есть тренер — отключите его, прежде чем подключать другого':
    'You already have a trainer — disconnect them before connecting another',
  'Сканировать QR': 'Scan QR',
  'Или введите код руками': 'Or type the code by hand',
  'Клиент наводит камеру — приложение откроется с готовым кодом':
    'The client points a camera — the app opens with the code filled in',
  'Ответ тренера': 'Trainer’s reply',
  'Насколько были сыты': 'How full you felt',
  'Что мешало держаться плана, что съели сверх нормы':
    'What got in the way, what you ate beyond the plan',
  'Пропустить отдых': 'Skip the rest',
  'Заметка клиента': 'Client’s note',
  'Общие комментарии': 'General comments',

  /* --- последние --- */
  'Итог по тренировке': 'Workout summary',
  'Общий комментарий: самочувствие, нагрузка, что меняем':
    'General comment: how it felt, the load, what we change',
  'Вес в следующий раз': 'Weight next time',
  'Что поправить в технике': 'What to fix in the technique',
  'Ещё не взвешивались — запишите первый вес.':
    'No weigh-ins yet — record your first weight.',
  'Записать вес': 'Record weight',
  'Программа для клиента': 'Program for the client',
  'Запланировать программу': 'Schedule the program',
  'Как прошла тренировка': 'How the workout went',
  'Самочувствие, что было тяжело, что болело':
    'How you felt, what was hard, what hurt',
  'Например: Верх / Низ': 'For example: Upper / Lower',

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
