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
  'Отсчёт между подходами': 'Countdown between sets',
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
  Данные: 'Data',
  'Тренировок сохранено': 'Workouts stored',
  Хранилище: 'Storage',
  Приложение: 'App',
  Браузер: 'Browser',
  онлайн: 'online',
  'в очереди': 'queued',
  'Выгрузить историю в CSV': 'Export history to CSV',
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
  'Выберите день и начните тренировку': 'Pick a day and start a workout',
  'за неделю': 'this week',
  'Вернуться к тренировке': 'Back to the workout',
  'Программа от тренера': 'Program from your trainer',
  Тренер: 'Trainer',
  'осталось': 'left',
  'из': 'of',
  'Открыть программу': 'Open program',
  сегодня: 'today',
  Вперёд: 'Forward',
  'По плану': 'Planned',
  'Нет тренировок в этот день': 'No workouts on this day',
  'Начать тренировку': 'Start a workout',
  'Свободная тренировка': 'Free workout',
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
  'Убрать подход': 'Remove set',
  'Подход убран': 'Set removed',
  'В подходе': 'Set',
  'уже записан результат. Убрать его вместе с записью?':
    'already has a result. Remove it along with what was logged?',
  /* «Оставить» уже переведено ниже, в блоке разбора отчётов. */
  'Календарь тренировок': 'Workout calendar',
  /* --- итог периода под календарём --- */
  'Тренировок нет': 'No workouts',
  'лучшая неделя': 'best week',
  'лучший месяц': 'best month',
  /* «т» уже переведено ниже, среди собираемых в строку кусков. */
  'На главную': 'Go home',
  'Укажите вес или повторения': 'Enter weight or reps',
  'Личный рекорд': 'Personal record',
  'Тренировка завершена': 'Workout finished',
  'Тренировка отменена — ни одного подхода': 'Workout discarded — no sets recorded',
  Заменить: 'Replace',
  'Заменить упражнение': 'Replace exercise',
  'Убрать упражнение': 'Remove exercise',
  'Упражнение заменено': 'Exercise replaced',
  'прошлый раз': 'last time',
  цель: 'target',
  Лучший: 'Best',
  Последний: 'Last',
  'Как делать': 'How to do it',
  'Статистика по подходам': 'Set statistics',
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
  '7 дней': '7 days',
  Практика: 'Practice',
  Документы: 'Documents',
  Оферта: 'Offer agreement',
  'Согласие на обработку персональных данных': 'Personal data consent',
  'Клиент подписывает их при подключении. Не прикреплённое не показывается и не подписывается.':
    'Clients sign these when joining. Anything not attached is neither shown nor signed.',
  Прикрепить: 'Attach',
  'Чтобы начать работу с тренером, примите его документы. Нажмите на название, чтобы открыть.':
    'To start working with this trainer, accept their documents. Tap a title to open it.',
  'У этого тренера нет прикреплённых документов, поэтому вы ничего не подписываете. Если ждали оферту или согласие на обработку данных — попросите его их приложить.':
    'This trainer has attached no documents, so you are signing nothing. If you expected an offer agreement or a personal data consent, ask them to attach it.',
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
  Войти: 'Sign in',
  Зарегистрироваться: 'Sign up',
  'Как вы будете пользоваться приложением?': 'How will you use the app?',
  'Я тренируюсь': 'I train',
  'Дневник тренировок, программы и прогресс': 'Workout diary, programs and progress',
  'Я тренер': 'I am a trainer',
  'Кабинет с клиентами, программы и обратная связь':
    'Client cabinet, programs and feedback',
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
  'Код отозван': 'Code revoked',
  'Не удалось отозвать код': 'Could not revoke the code',
  'Нет данных по метрике': 'No data for this metric',
  'Не удалось сдать отчёт — попробуйте ещё раз': 'Could not submit the report — please try again',
  'Не удалось сохранить — попробуйте ещё раз': 'Could not save — please try again',
  'Сообщение не отправилось — попробуйте ещё раз': 'The message did not send — please try again',
  Мобилити: 'Mobility',
  'Верх / Низ': 'Upper / Lower',
  'Верх · сила': 'Upper · strength',
  'Низ · сила': 'Lower · strength',
  'Верх · объём': 'Upper · volume',
  'Низ · объём': 'Lower · volume',
  'Push · грудь, плечи, трицепс': 'Push · chest, shoulders, triceps',
  'Pull · спина, бицепс': 'Pull · back, biceps',
  'Legs · ноги, ягодицы': 'Legs · legs, glutes',
  'Первые шаги в зале': 'First steps in the gym',
  'День A': 'Day A',
  'День B': 'Day B',
  'День C': 'Day C',
  'Ягодицы и ноги': 'Glutes and legs',
  'Ягодичные · тяжёлый': 'Glutes · heavy',
  'Ягодичные · объём': 'Glutes · volume',
  'Дома без оборудования': 'At home, no equipment',
  'Верх тела': 'Upper body',
  'Низ тела': 'Lower body',
  'Кардио и всё тело': 'Cardio and full body',
  'Дом · три дня в неделю': 'Home · three days a week',
  'Понедельник · всё тело A': 'Monday · full body A',
  'Среда · всё тело B': 'Wednesday · full body B',
  'Пятница · всё тело C': 'Friday · full body C',
  Гость: 'Guest',
  'Четыре тренировки в неделю: два дня на верх тела, два на низ. Каждая группа получает нагрузку дважды за неделю — оптимальный режим для роста массы.':
    'Four workouts a week: two upper-body days, two lower-body days. Every muscle group is trained twice a week — the best setup for building mass.',
  'Классический сплит по типу движения: жимовые, тяговые и ноги. Подходит для трёх или шести тренировок в неделю.':
    'The classic split by movement type: push, pull and legs. Works for three or six workouts a week.',
  'Три тренировки на всё тело для тех, кто начинает. Базовые движения в тренажёрах и с гантелями, минимум изоляции.':
    'Three full-body workouts for beginners. Compound movements on machines and with dumbbells, minimal isolation.',
  'Три тренировки с акцентом на ягодичные. Тазовые движения и отведения в дополнение к приседу и тяге.':
    'Three workouts focused on the glutes. Hip movements and abductions on top of squats and deadlifts.',
  'Тренировки с собственным весом. Нужен только коврик и двадцать пять минут.':
    'Bodyweight training. All you need is a mat and twenty-five minutes.',
  'Понедельник, среда, пятница — всё тело каждый раз, из инвентаря только коврик.':
    'Monday, Wednesday, Friday — full body every time, a mat is all the equipment you need.',
  // Описание программы лежит в базе одной склеенной строкой — ключом должна
  // быть она целиком, иначе перевод первого предложения не сработает.
  'Понедельник, среда, пятница — всё тело каждый раз, из инвентаря только коврик. Сутки отдыха между тренировками: мышца успевает восстановиться, а привычка держится на трёх опорах в неделю, а не на одной. Начинайте с пяти минут разминки, заканчивайте растяжкой. Прогрессия — повторениями: когда все подходы даются уверенно, добавляйте по два повторения к каждому.':
    'Monday, Wednesday, Friday — full body every time, a mat is all the equipment you need. ' +
    'A day of rest between workouts: the muscle recovers, and the habit rests on three ' +
    'points in the week rather than one. Start with five minutes of warm-up, finish with ' +
    'stretching. Progress by reps: once every set feels confident, add two reps to each.',
  Бодибилдинг: 'Bodybuilding',
  Пауэрлифтинг: 'Powerlifting',
  'Тяжелая атлетика': 'Weightlifting',
  'Тяжёлая атлетика': 'Weightlifting',
  Фитнес: 'Fitness',
  Бег: 'Running',
  Реабилитация: 'Rehabilitation',
  'Функциональный тренинг': 'Functional training',
  'Гиревой спорт': 'Kettlebell sport',
  'Аккаунт не найден': 'Account not found',
  'Нужна подписка: без неё нельзя набирать клиентов и назначать им программы':
    'A subscription is required: without it you cannot take on clients or assign them programs',
  'Приглашения выпускает только тренер': 'Only a trainer can issue invites',
  'Код не сохранился на сервере — проверьте связь и попробуйте снова':
    'The code was not saved on the server — check your connection and try again',
  'Код уже использован': 'This code has already been used',
  'Срок действия кода истёк': 'The code has expired',
  'Нельзя пригласить самого себя': 'You cannot invite yourself',
  'Вы уже работаете с этим тренером': 'You already work with this trainer',
  'Программу назначил тренер — свой план поверх неё не ставится':
    'The program was assigned by your trainer — your own plan cannot go on top of it',
  'Тренировочный день не найден': 'Workout day not found',
  'Тренировка не найдена': 'Workout not found',
  'Нужно войти': 'You need to sign in',
  'Не удалось загрузить каталог': 'Could not load the catalog',
  'Возраст и пол': 'Age and sex',
  Клиент: 'Client',
  Вода: 'Water',
  Белок: 'Protein',
  Минералы: 'Minerals',
  'Висцеральный жир': 'Visceral fat',
  ИМТ: 'BMI',
  'Безжировая масса': 'Lean mass',
  'Жировая масса': 'Fat mass',
  'Скелетные мышцы': 'Skeletal muscle',
  'Основной обмен веществ': 'Basal metabolic rate',
  'Обмен веществ': 'Metabolism',
  'Суточная норма': 'Daily norm',
  'Талия к росту': 'Waist to height',
  'Талия к бёдрам': 'Waist to hip',
  Рост: 'Height',
  Возраст: 'Age',
  л: 'l',
  мл: 'ml',
  'Общая масса тела: мышцы, жир, кости, вода и всё остальное. Сам по себе вес не говорит, из чего он состоит, — за этим смотрят на жир и мышцы.':
    'Total body mass: muscle, fat, bone, water and everything else. Weight alone says nothing about what it is made of — for that you look at fat and muscle.',
  'Соотношение мышц и жира': 'The ratio of muscle to fat',
  'Количество воды в организме': 'How much water the body holds',
  'Питание и уровень физической активности': 'Nutrition and physical activity',
  'Доля жировой массы в общем весе. Меняется медленнее веса: вес скачет от воды и содержимого кишечника, процент жира — нет.':
    'The share of fat mass in total weight. It moves slower than weight: weight swings with water and gut contents, body fat does not.',
  'Баланс калорий: сколько получено против потрачено':
    'Calorie balance: intake against expenditure',
  'Силовые нагрузки — они удерживают мышцы, пока уходит жир':
    'Strength training — it holds muscle while fat comes off',
  'Сон и уровень стресса': 'Sleep and stress levels',
  'Масса скелетных мышц — тех, которыми вы двигаете телом. Растёт медленно, месяцами, и заметнее всего в начале тренировок.':
    'The mass of skeletal muscle — the muscle you move your body with. It grows slowly, over months, and most visibly at the start of training.',
  'Регулярные силовые тренировки и рост нагрузки': 'Regular strength training and rising load',
  'Достаточность белка в рационе': 'Enough protein in the diet',
  'Восстановление и сон': 'Recovery and sleep',
  'Общая вода в организме: внутри клеток и между ними. Сильнее прочих метрик пляшет ото дня ко дню.':
    'Total body water, inside and between cells. It swings from day to day more than any other metric.',
  'Сколько выпито за сутки': 'How much you drank that day',
  'Соль и углеводы в рационе': 'Salt and carbohydrates in the diet',
  'Время суток и недавняя тренировка': 'Time of day and a recent workout',
  'Белок в составе тела — прежде всего в мышцах и органах. Идёт рука об руку с мышечной массой.':
    'Protein in the body, mostly in muscle and organs. It goes hand in hand with muscle mass.',
  'Белок в рационе': 'Protein in the diet',
  'Силовые нагрузки': 'Strength training',
  'Общая калорийность питания': 'Total calorie intake',
  'Минеральные вещества: в основном костная ткань, немного — в крови и тканях. Меняется очень медленно.':
    'Minerals: mostly bone tissue, a little in blood and other tissue. Changes very slowly.',
  'Кальций, фосфор и витамин D в рационе': 'Calcium, phosphorus and vitamin D in the diet',
  'Силовые и ударные нагрузки': 'Strength and impact loading',
  'Жир вокруг внутренних органов в брюшной полости — в отличие от подкожного, снаружи его не видно и не прощупать.':
    'Fat around the internal organs in the abdomen — unlike subcutaneous fat, you can neither see nor feel it from outside.',
  'Общее количество жира в теле': 'Total body fat',
  'Питание и режим сна': 'Nutrition and sleep schedule',
  'Регулярность нагрузок': 'How regular the training is',
  'Индекс массы тела: вес относительно роста в квадрате. Состав тела он не различает — у мускулистого человека выходит высоким без лишнего жира.':
    'Body mass index: weight relative to height squared. It cannot tell composition apart — a muscular person scores high without excess fat.',
  'Всё, кроме жира: мышцы, кости, органы и вода. Её и стараются сохранить, когда снижают вес.':
    'Everything but fat: muscle, bone, organs and water. This is what you try to keep while losing weight.',
  'Скорость снижения веса': 'How fast weight is coming off',
  'Сколько энергии тело тратит в полном покое — на дыхание, сердцебиение и обмен веществ. Это не суточная норма: сверху добавляются движение и тренировки.':
    'How much energy the body spends at complete rest — breathing, heartbeat and metabolism. This is not your daily target: movement and training come on top.',
  'Длительное недоедание': 'Prolonged under-eating',
  'Сделайте первый замер': 'Take your first measurement',
  'Загрузите PDF из DDX Fitness или распечатку InBody — разберём состав, нормы и сегментарный анализ. Нет отчёта — введите вес и обхваты руками, состав посчитается по ним.':
    'Upload a PDF from DDX Fitness or an InBody printout — we will break down composition, norms and segmental analysis. No report? Enter weight and girths by hand and composition is estimated from them.',
  'Загрузить отчёт InBody': 'Upload InBody report',
  'Загрузить новый замер': 'Upload a new measurement',
  'Файл никуда не отправляется — разбор идёт прямо на устройстве.':
    'The file goes nowhere — it is parsed right on your device.',
  'Клиент может загрузить отчёт сам — или загрузите его PDF здесь: состав, нормы и сегментарный анализ появятся и в приложении клиента.':
    'The client can upload the report themselves — or upload their PDF here: composition, norms and segmental analysis will appear in their app too.',
  'Загрузить отчёт клиента': 'Upload client report',
  'Загрузить новый замер клиента': 'Upload a new client measurement',
  'Замеров InBody нет — можно загрузить отчёт клиента':
    'No InBody measurements — you can upload the client report',
  'Загрузите отчёт InBody — разберём мышцы, жир, воду и нормы':
    'Upload an InBody report — we will break down muscle, fat, water and norms',
  'на уровне пупка, не втягивая живот': 'at navel level, without pulling the stomach in',
  'по самой широкой части ягодиц': 'around the widest part of the glutes',
  'один раз на старте, потом меняется в настройках':
    'once at the start, changed in settings afterwards',
  'Внести вес': 'Log weight',
  'Каждый день в 08:00': 'Every day at 08:00',
  'Внести замеры': 'Log measurements',
  'Воскресенье 20:00 и понедельник 08:00': 'Sunday 20:00 and Monday 08:00',
  'Сдать отчёт по питанию': 'Submit nutrition report',
  'Каждый день в 22:00': 'Every day at 22:00',
  'Сдать отчёт по тренировке': 'Submit workout report',
  'Через 4 часа после тренировки, если не сдан': '4 hours after a workout, if not submitted',
  'Напоминание об оплате': 'Payment reminder',
  'За 3 дня до даты оплаты': '3 days before the payment date',
  Тренировка: 'Workout',
  'Нажмите «Начать» на главной. Вес и повторения подставятся из прошлого раза — останется подтвердить подход галочкой.':
    'Tap Start on the home screen. Weight and reps are filled in from last time — all that is left is to tick the set off.',
  'Таймер отдыха': 'Rest timer',
  'Запускается автоматически после подхода. Время берётся из программы, иначе из настроек. Не нужен — выключается там же.':
    'Starts automatically after a set. The duration comes from the program, otherwise from settings. Do not need it — the same place turns it off.',
  'Замена упражнения': 'Swapping an exercise',
  'Тренажёр занят — нажмите иконку замены в шапке упражнения. Введённые подходы сохранятся.':
    'Machine taken? Tap the swap icon in the exercise header. Sets you already entered are kept.',
  'Без интернета': 'Without internet',
  'Всё пишется на устройство. Появится сеть — данные уйдут в облако сами.':
    'Everything is written to the device. Once there is a connection, the data goes to the cloud on its own.',
  'Получите код у тренера и введите его в разделе «Тренер». Он сможет назначать программы и комментировать тренировки.':
    'Get a code from your trainer and enter it in the Trainer section. They will be able to assign programs and comment on your workouts.',
  'Логирование в два касания': 'Two-tap logging',
  'Вес и повторения подставляются из прошлой тренировки — вспоминать ничего не нужно.':
    'Weight and reps are filled in from the last workout — nothing to remember.',
  'Работает без интернета': 'Works offline',
  'В подвальном зале приложение открывается и пишет данные как обычно.':
    'In a basement gym the app still opens and records as usual.',
  'Прогресс виден сразу': 'Progress is visible right away',
  'Тоннаж, рекорды и расчётный максимум считаются автоматически.':
    'Tonnage, records and estimated max are calculated automatically.',
  'Все клиенты на одном экране': 'All clients on one screen',
  'Сразу видно, кто выпал из графика, а кто выполняет план.':
    'You see at once who has fallen behind and who is on plan.',
  'Программы по коду': 'Programs by code',
  'Выпускаете код, клиент вводит его — и получает вашу программу.':
    'You issue a code, the client enters it — and gets your program.',
  'Обратная связь по тренировке': 'Feedback on the workout',
  'Комментарий прилетает клиенту прямо в карточку тренировки.':
    'Your comment lands right in the client\'s workout card.',
  'Держать вес': 'Maintain weight',
  'Снижать вес': 'Lose weight',
  Набирать: 'Gain',
  'День питания': 'Nutrition day',
  'очень голодный': 'very hungry',
  голодный: 'hungry',
  нормально: 'fine',
  сытый: 'full',
  'очень сытый': 'very full',
  Авто: 'Auto',
  Светлая: 'Light',
  Тёмная: 'Dark',
  'Аккаунт создан': 'Account created',
  Видео: 'Video',
  Фото: 'Photo',
  МБ: 'MB',
  'Сжимаю…': 'Compressing…',
  'Видео прикреплено': 'Video attached',
  'Видео удалено': 'Video deleted',
  'Не удалось прикрепить файл': 'Could not attach the file',
  /* --- отправка ролика тренеру: короткое слово в строке размера --- */
  'у тренера': 'with the trainer',
  'отправляю…': 'sending…',
  'ждёт отправки': 'waiting to be sent',
  'не ушло': 'not sent',
  'Видео на устройстве, тренеру не ушло — слишком большое для сервера':
    'The video is on your device but did not reach the trainer — too large for the server',
  'Файл на устройстве, тренеру не ушёл — слишком большой для сервера':
    'The file is on your device but did not reach the trainer — too large for the server',
  'Отправить ещё раз': 'Send again',
  'На устройстве кончилось место — удалите старые ролики и попробуйте снова':
    'The device is out of space — delete old clips and try again',
  'Вложение · пока не поддерживается': 'Attachment · not supported yet',
  'Браузер не умеет распознавать штрихкоды — введите код вручную':
    'This browser cannot read barcodes — enter the code by hand',
  'Нет доступа к камере — введите код вручную': 'No camera access — enter the code by hand',
  'Наведите камеру на штрихкод — распознается сам':
    'Point the camera at the barcode — it reads itself',
  'Выбрать упражнение': 'Pick an exercise',
  'Напишите тренеру — он увидит сообщение у себя в карточке.':
    'Write to your trainer — they will see the message on their card.',
  'Задание выдано': 'Task issued',
  Сдана: 'Submitted',
  Связаться: 'Get in touch',
  'Отметить разобранным': 'Mark as reviewed',
  'Ответить и отметить разобранным': 'Reply and mark as reviewed',
  Снизить: 'Lower',
  Оставить: 'Keep',
  Прибавить: 'Add',
  '· прочитано': '· read',
  '· своё': '· custom',
  'От тренера ·': 'From trainer ·',
  'Условия, на которых вы работаете с клиентом': 'The terms you work with the client on',
  'Какие данные вы собираете и зачем': 'What data you collect and why',
  Гипертрофия: 'Hypertrophy',
  Сила: 'Strength',
  Похудение: 'Fat loss',
  Дом: 'At home',
  Кроссфит: 'CrossFit',
  Всё: 'All',
  Бицепс: 'Biceps',
  'Верх груди': 'Upper chest',
  'Верх спины': 'Upper back',
  Выпрямители: 'Erectors',
  Голень: 'Calves',
  Другое: 'Other',
  'Задняя дельта': 'Rear delt',
  'Задняя поверхность бедра': 'Hamstrings',
  Квадрицепс: 'Quadriceps',
  'Передняя дельта': 'Front delt',
  Предплечье: 'Forearm',
  Пресс: 'Abs',
  Приводящие: 'Adductors',
  'Середина/низ груди': 'Mid/lower chest',
  'Средняя дельта': 'Side delt',
  Трицепс: 'Triceps',
  Широчайшие: 'Lats',
  Ягодичные: 'Glutes',
  Грудные: 'Chest',
  Икры: 'Calves',
  Хамстринги: 'Hamstrings',
  Аксессуары: 'Accessories',
  Гантели: 'Dumbbells',
  Гири: 'Kettlebells',
  Кардио: 'Cardio',
  'Рамы, скамейки, стойки и т.п.': 'Racks, benches, stands etc.',
  'Свободные веса': 'Free weights',
  'Свой вес': 'Bodyweight',
  Тренажеры: 'Machines',
  База: 'Compound',
  Изоляция: 'Isolation',
  Финишеры: 'Finishers',
  Пользовательский: 'Custom',
  'Дегенеративные изменения суставно-связочного аппарата':
    'Degenerative changes of joints and ligaments',
  Акцент: 'Focus',
  Б: 'P',
  Ж: 'F',
  У: 'C',
  г: 'g',
  ккал: 'kcal',
  сек: 'sec',
  см: 'cm',
  ч: 'h',
  мин: 'min',
  мышцы: 'muscle',
  жир: 'fat',
  калорий: 'of calories',
  граммов: 'grams',
  миллилитров: 'millilitres',
  'на 100': 'per 100',
  'подх.': 'sets',
  'База продуктов': 'Food database',
  'Банковской картой (ЮKassa)': 'By bank card (YooKassa)',
  'Оплатить через СБП': 'Pay via SBP',
  'Оформить за 499 ₽ в месяц': 'Subscribe for 499 ₽ a month',
  Год: 'Year',
  'Без неё нельзя выпускать коды приглашения, назначать программы и собирать персональные планы. Уже набранные клиенты и их история остаются на месте — вы просто не сможете добавлять новых и менять назначения.':
    'Without it you cannot issue invite codes, assign programs or build personal plans. Existing clients and their history stay put — you just cannot add new ones or change assignments.',
  'Без обхвата шеи процент жира не посчитать — укажите его в настройках профиля.':
    'Body fat cannot be estimated without a neck measurement — set it in profile settings.',
  'Без роста процент жира по обхватам не посчитать — укажите его выше.':
    'Body fat cannot be estimated from girths without height — enter it above.',
  'Безвозвратно, вместе со всеми данными': 'Permanently, along with all data',
  'В моём плане': 'In my plan',
  'В план': 'Add to plan',
  'Убрать из плана': 'Remove from plan',
  'В прототипе оплата эмулируется и просто включает подписку. В проде права выдаёт эквайер по вебхуку.':
    'In the prototype payment is simulated and simply turns the subscription on. In production the acquirer grants access by webhook.',
  'В этом дне пока нет упражнений': 'This day has no exercises yet',
  'Ваш ответ': 'Your answer',
  'Ввести замер вручную': 'Enter measurement manually',
  'Ввести код тренера': 'Enter trainer code',
  'Вес × повторения за неделю. Всего за': 'Weight × reps per week. Total for',
  'Видео-отчёт не запрашивается — технику вы видите на занятии.':
    'No video reports requested — you see the technique in person.',
  'Войдите, чтобы дневник и замеры синхронизировались.':
    'Sign in so your diary and measurements sync.',
  'Восстановить будет нечем — резервной копии вашего аккаунта у нас не остаётся.':
    'There will be nothing to restore from — we keep no backup of your account.',
  'Все замеры': 'All measurements',
  'Выберите хотя бы один день': 'Pick at least one day',
  'Выбрать другое': 'Choose another',
  'Выйти без сохранения': 'Leave without saving',
  Готовая: 'Ready-made',
  'Своя с нуля': 'Build your own',
  'Создать и наполнить': 'Create and fill',
  'Данные из отчёта': 'Data from the report',
  'Данные о продуктах — Open Food Facts, открытая база со штрихкодами.':
    'Food data comes from Open Food Facts, an open barcode database.',
  'Данные останутся на сервере': 'Data stays on the server',
  'Дата следующей оплаты не задана — напоминание клиенту не придёт.':
    'No next payment date set — the client will get no reminder.',
  'Даты оплаты сохранены': 'Payment dates saved',
  День: 'Day',
  'День обновлён': 'Day updated',
  'День сдан тренеру': 'Day submitted to the trainer',
  'Для женской формулы нужен обхват таза: без него расчёт занижает жир.':
    'The female formula needs a hip measurement: without it the estimate is too low.',
  'Дневник тренировок, замеры и питание.': 'Workout diary, measurements and nutrition.',
  'Добавить в мои': 'Add to mine',
  'Убрать из моих': 'Remove from mine',
  'Добавить замер': 'Add measurement',
  'Добавить замеры': 'Add measurements',
  Добавлено: 'Added',
  'Добавлено в мои программы': 'Added to my programs',
  'Убрано из моих программ': 'Removed from my programs',
  'Достаточно веса. Обхваты дадут состав тела без весов с биоимпедансом.':
    'Weight alone is enough. Girths give body composition without a bioimpedance scale.',
  Ежедневный: 'Daily',
  'Если его нет, проверьте папку со спамом.': 'If it is missing, check your spam folder.',
  'Если по своим наблюдениям расход отличается — сместите его вручную.':
    'If your own observations differ, shift the estimate manually.',
  'Есть код от тренера? Введите его — тренер сможет назначать вам программы и комментировать тренировки.':
    'Got a code from a trainer? Enter it — they will be able to assign you programs and comment on your workouts.',
  'Забыли пароль': 'Forgot password',
  'Заведите аккаунт — данные будут доступны на всех ваших устройствах.':
    'Create an account — your data will be available on all your devices.',
  'Уже есть аккаунт — войти': 'Already have an account — sign in',
  'Загрузить InBody': 'Upload InBody',
  'Задание выполнено': 'Task completed',
  'Замер добавлен': 'Measurement added',
  'Замер за эту дату обновлён': 'Measurement for this date updated',
  'Замер обновлён': 'Measurement updated',
  'Замер от': 'Measured on',
  'Замер удалён': 'Measurement deleted',
  'Замеров пока нет': 'No measurements yet',
  Занимаюсь: 'I train',
  Тренирую: 'I coach',
  Записать: 'Record',
  'Записи в дневнике хранят копию состава на момент добавления, поэтому правки и удаление продукта не меняют прошлые дни.':
    'Diary entries keep a copy of the nutrition facts from the moment they were added, so edits and deletions do not change past days.',
  'Запланировать на': 'Schedule for',
  'Из галереи': 'From gallery',
  'Изменения сохранены': 'Changes saved',
  'История очищена': 'History cleared',
  'К клиенту': 'To client',
  'Кабинет с клиентами, программами и обратной связью.':
    'A workspace with clients, programs and feedback.',
  'Как менялся ваш обмен веществ': 'How your metabolism changed',
  'Калории на 100': 'Calories per 100',
  'Каталог восстановлен': 'Catalog restored',
  Ккал: 'Kcal',
  'Клетчатка, сахар, натрий': 'Fibre, sugar, sodium',
  'Клиент не увидит план тренировок, пока вы не назначите программу.':
    'The client will not see a workout plan until you assign a program.',
  'Клиент не указал, где с ним связаться. Попросите заполнить это в профиле.':
    'The client has not said where to reach them. Ask them to fill it in their profile.',
  'Клиент сдаёт видео-отчёты, вы разбираете технику по записи.':
    'The client submits video reports and you review technique from the recording.',
  'Клиент увидит эти ссылки в карточке тренера и напишет вам в один тап.':
    'The client sees these links on your trainer card and can message you in one tap.',
  'Клиентам приложение бесплатно целиком — они ничего не оплачивают и ни во что не упираются.':
    'For clients the app is entirely free — they pay nothing and hit no limits.',
  'Клиенту напомним за 3 дня —': 'We will remind the client 3 days ahead —',
  Код: 'Code',
  Количество: 'Amount',
  'Комментарий к упражнению': 'Comment on the exercise',
  'Комментарий отправлен клиенту': 'Comment sent to the client',
  'Комментарий тренеру, если нужен': 'A note for your trainer, if needed',
  'Мой план': 'My plan',
  'Набирать клиентов и назначать программы можно только с подпиской. Те, кто уже с вами, никуда не денутся — их история и переписка на месте.':
    'Taking on clients and assigning programs requires a subscription. Those already with you stay — their history and messages are untouched.',
  'Набор клиентов, ведение и назначение программ — без ограничений.':
    'Taking on clients, coaching them and assigning programs — no limits.',
  'Нажмите вторую метрику, чтобы сравнить': 'Tap a second metric to compare',
  'Нажмите, чтобы синхронизировать сейчас': 'Tap to sync now',
  'Назад к поиску': 'Back to search',
  'Назначить на': 'Assign for',
  'Найти продукт': 'Find a food',
  'Напишите клиенту — сообщение появится у него в разделе «Чат».':
    'Write to the client — the message appears in their Chat section.',
  'Не удалось назначить программу': 'Could not assign the program',
  'Не удалось переключить режим': 'Could not switch mode',
  'Не удалось подключить тренера': 'Could not connect the trainer',
  'Не удалось разобрать PDF': 'Could not read the PDF',
  'Не удалось создать код': 'Could not create a code',
  'Не удалось создать программу': 'Could not create the program',
  'Не удалось сохранить план': 'Could not save the plan',
  'Не удалось удалить аккаунт': 'Could not delete the account',
  Недавние: 'Recent',
  'Уже записывали': 'Logged before',
  'Необязательно. Можно пропустить и прикрепить позже — тренировка останется в истории.':
    'Optional. You can skip it and attach later — the workout stays in your history.',
  'Неотмеченные подходы не попадут в статистику.':
    'Unchecked sets will not count towards statistics.',
  'Нет превью': 'No preview',
  'Нет связи с базой продуктов': 'No connection to the food database',
  'Нет связи с сервером': 'No connection to the server',
  'Нет связи с сервером — попробуем позже': 'No connection to the server — we will try later',
  'Ни один подход не отмечен галочкой — сохранять нечего, и в календаре тренировка не появится. Отметьте выполненные подходы и завершите снова.':
    'No set is checked, so there is nothing to save and the workout will not appear in the calendar. Check the sets you completed and finish again.',
  'Ни один файл разобрать не удалось': 'None of the files could be read',
  'Ничего не нашлось.': 'Nothing found.',
  'Новый клиент': 'New client',
  'Новый тренер': 'New trainer',
  'Нужен ещё один замер, чтобы увидеть тренд': 'One more measurement is needed to see a trend',
  'Обновить отчёт': 'Update report',
  Ограничения: 'Restrictions',
  'Оплата просрочена с': 'Payment overdue since',
  'Опыт не указан': 'Experience not set',
  'Опыт, образование, подход к работе': 'Experience, education, approach',
  'От этого зависят экраны — их можно переключить позже в профиле.':
    'This decides which screens you get — you can switch later in your profile.',
  'Отключить тренера': 'Disconnect trainer',
  'Открыть замеры': 'Open measurements',
  'Открыть профиль': 'Open profile',
  'Отменить тренировку': 'Cancel workout',
  'Отметить всё': 'Check all',
  'Отправить клиенту': 'Send to client',
  'Отправить письмо': 'Send email',
  Отправлено: 'Sent',
  получено: 'received',
  'Отчёт обновлён': 'Report updated',
  'Отчёт от': 'Report from',
  'Отчёт сдан': 'Report submitted',
  'Оценка по формуле': 'Formula estimate',
  'Передайте код клиенту — он вводит его в своём профиле в разделе «Тренер». Код одноразовый и действует 7 дней.':
    'Give the code to your client — they enter it in the Trainer section of their profile. It is single-use and valid for 7 days.',
  'Перезагрузить приложение': 'Reload the app',
  'Персональный тренер': 'Personal trainer',
  'Письмо отправлено на': 'Email sent to',
  'Пишите как есть — это для вас и для тренера':
    'Write it as it is — this is for you and your trainer',
  'План выполняется полностью.': 'The plan is being followed in full.',
  'План на неделю': 'Plan for the week',
  'План снят': 'Plan removed',
  'План сохранён — дни появятся в календаре':
    'Plan saved — the days will appear in the calendar',
  'По вашим данным': 'From your data',
  'По замеру от': 'From the measurement on',
  'По росту и балансу мышц, жира и воды':
    'Based on height and the balance of muscle, fat and water',
  'По штрихкоду': 'By barcode',
  'Повторить эту тренировку': 'Repeat this workout',
  'Подключая тренера, вы открываете ему доступ к своей истории тренировок.':
    'By connecting a trainer you give them access to your workout history.',
  'Подписка отключена': 'Subscription turned off',
  'Подписка активна': 'Subscription active',
  'Подходы по всем дням программы. Пересчитывается на месте — видно, куда перекосило, пока программу ещё собирают.':
    'Sets across all days of the program. Recalculated as you go, so imbalances show while the program is still being built.',
  'Пока пусто': 'Nothing here yet',
  'Пока пусто. Заведите домашнее блюдо или товар, которого нет в базе, — дальше он будет подставляться в дневник в одно нажатие.':
    'Nothing here yet. Add a home dish or a product missing from the database — after that it goes into the diary in one tap.',
  'Показать ещё': 'Show more',
  'Поправка снята': 'Adjustment removed',
  'Попробовать снова': 'Try again',
  Порция: 'Serving',
  'Приложение переключится на ваш собственный дневник: тренировки, замеры, питание. Список клиентов и программы сохранятся — вернуться можно этим же переключателем в настройках.':
    'The app switches to your own diary: workouts, measurements, nutrition. Your client list and programs are kept — the same switch in settings brings you back.',
  'Приложение переключится на кабинет тренера: клиенты, программы, разбор отчётов. Ваша история тренировок сохранится.':
    'The app switches to the trainer workspace: clients, programs, report reviews. Your workout history is kept.',
  'Пришлём письмо со ссылкой для нового пароля.':
    'We will email you a link to set a new password.',
  'Программа для': 'Program for',
  'Программа назначена': 'Program assigned',
  'Программа создана — добавьте упражнения': 'Program created — add exercises',
  'Продукт сохранён': 'Food saved',
  'Продукт сохранён — теперь он в ваших': 'Food saved — it is now in yours',
  'Продукт удалён — записи в дневнике остались': 'Food deleted — diary entries remain',
  Пропущено: 'Missed',
  'Прототип v0.2 · офлайн-первое хранилище IndexedDB':
    'Prototype v0.2 · offline-first IndexedDB storage',
  'Работа с клиентом завершена': 'Work with the client has ended',
  'Рабочий вес в последней тренировке и изменение расчётного максимума за':
    'Working weight in the last workout and the change in estimated max over',
  'Рабочий вес в последней тренировке и изменение расчётного максимума за четыре недели.':
    'Working weight in the last workout and the change in estimated max over four weeks.',
  'Разбивка по БЖУ': 'Macro split',
  'Разбор отправлен': 'Review sent',
  'Разложите дни по дням недели — они появятся в календаре на главной':
    'Lay the days out across the week — they will appear in the calendar on the home screen',
  'Разобрать технику': 'Review technique',
  'Разрешение не выдано': 'Permission not granted',
  'Уведомления включены': 'Notifications enabled',
  'Расход оценён по формуле': 'Expenditure estimated by formula',
  'Расчётный максимум на одно повторение — по формуле Эпли из лучшего подхода.':
    'Estimated one-rep max, by the Epley formula from the best set.',
  'Режим: онлайн': 'Mode: online',
  'Режим: очно': 'Mode: in person',
  'Рекомендация по весу отправлена': 'Weight guidance sent',
  'Своё упражнение видно только вам.': 'Your own exercise is visible only to you.',
  'Сдать день тренеру': 'Submit the day to the trainer',
  'Сдать тренировку': 'Submit workout',
  'Сейчас данные лежат только на этом устройстве':
    'Right now the data lives only on this device',
  'Сейчас действует программа от тренера': 'A trainer program is currently active',
  'Секунду…': 'One moment…',
  'Силовой тренинг': 'Strength training',
  'Синхронизация…': 'Syncing…',
  'Сколько осталось до оптимального веса при сохранении мышечной массы.':
    'How far you are from the optimal weight while keeping muscle mass.',
  'Содержание жира': 'Fat content',
  'Содержание мышц': 'Muscle content',
  'Создадим пустую программу под этого клиента. Наполните её днями и упражнениями, потом назначьте на дни недели.':
    'We will create an empty program for this client. Fill it with days and exercises, then assign it to weekdays.',
  'Создать аккаунт': 'Create account',
  'Создать продукт': 'Create food',
  'Создаю…': 'Creating…',
  'Состав по замеру от': 'Composition from the measurement on',
  'Сохранить замер': 'Save measurement',
  'Сохранить и добавить': 'Save and add',
  'Сохранить изменения': 'Save changes',
  'Сохранить продукт': 'Save food',
  'Такого штрихкода нет в базе — заполните сами':
    'This barcode is not in the database — fill it in yourself',
  Техника: 'Technique',
  'Точно удалить? Вместе с ними исчезнет история веса':
    'Delete for sure? Your weight history goes with them',
  'Тренер видит вашу историю тренировок, прогресс и замеры тела. Личные настройки приложения и другие тренеры ему недоступны.':
    'Your trainer sees your workout history, progress and body measurements. Your app settings and other trainers are not visible to them.',
  'Тренер ещё не указал, где с ним связаться.':
    'The trainer has not said where to reach them yet.',
  'Тренер напишет вам туда, где вам удобно отвечать.':
    'Your trainer will write where it is convenient for you to reply.',
  'Тренер отключён': 'Trainer disconnected',
  подключён: 'connected',
  'Тренировка идёт — нажмите, чтобы вернуться': 'A workout is in progress — tap to return',
  'Тренировка уже сохранена. Ролики можно прикрепить к любому упражнению ниже — хоть сейчас, хоть вечером.':
    'The workout is already saved. You can attach clips to any exercise below — now or later tonight.',
  Удалено: 'Deleted',
  'Удалим всё: тренировки, замеры, питание, программы и связь с':
    'We will delete everything: workouts, measurements, nutrition, programs and the link with',
  клиентами: 'clients',
  тренером: 'your trainer',
  'Удалить все замеры': 'Delete all measurements',
  'Укажите количество': 'Enter an amount',
  Упражнение: 'Exercise',
  'Упражнение добавлено': 'Exercise added',
  'Условия работы': 'Terms of work',
  'Чат с': 'Chat with',
  непрочитанных: 'unread',
  Написать: 'Write to',
  Читаю: 'Reading',
  'Читаю отчёт…': 'Reading the report…',
  'Что влияет на': 'What affects',
  'Что вы получаете': 'What you get',
  'Что вы съели': 'What did you eat',
  'Экран не удалось построить. Данные на устройстве не пострадали.':
    'The screen could not be rendered. Data on your device is unaffected.',
  'в дневнике': 'in the diary',
  'в каталоге': 'in the catalog',
  'в неделю': 'per week',
  'ваша программа': 'your program',
  'готов — передайте клиенту': 'is ready — give it to your client',
  добавлено: 'added',
  обновлено: 'updated',
  'ещё не выполнялось': 'not done yet',
  'из плана.': 'of the plan.',
  'ищу…': 'searching…',
  'лучший 1ПМ': 'best 1RM',
  моя: 'mine',
  'на разбор': 'to review',
  'не назначен': 'not assigned',
  'не прочитано': 'unread',
  прочитано: 'read',
  отчёт: 'report',
  'отчёта нет': 'no report',
  проверен: 'reviewed',
  'посчитаем сами': 'we will work it out',
  'программа платформы': 'platform program',
  'прочитать не удалось — эти пропустим.': 'could not be read — we will skip those.',
  съедено: 'eaten',
  'от тренера': 'from trainer',
  Создать: 'Create',
  'как делать': 'how to do it',
  оффлайн: 'offline',
  Статистика: 'Statistics',
  'На этой неделе': 'This week',
  'Загружаю план…': 'Loading the plan…',
  'следующая по плану': 'next in the plan',
  'Создать свою тренировку': 'Create your own workout',
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

  /* --- питание: строки, собираемые из числа и единицы --- */
  'Расход по вашим данным': 'Expenditure from your data',
  'Тренер пока не выдал норму по калориям — записи сохраняются, цель появится вместе с рекомендациями.':
    'Your trainer has not set a calorie target yet — entries are still saved, the target arrives with the recommendations.',

  /* --- собираемые в строку куски: «10 workouts in 4 weeks», «86.8 t» --- */
  за: 'in',
  т: 't',
  макс: 'max',

  'Удалить заготовку': 'Delete template',
  'Тренер назначил программу': 'Your trainer assigned a program',
  'Она ещё не загрузилась на это устройство. Проверьте связь и обновите приложение — программа появится сама.':
    'It has not reached this device yet. Check your connection and update the app — the program will appear on its own.',
  Нет: 'No',
  Смотреть: 'View',

  /* --- ответы сервера при слишком частых запросах --- */
  /* Экран входа показывает сообщение сервера как есть (см. Auth.tsx), поэтому
     оба текста — и наш, и встроенный в PocketBase — переводятся здесь. */
  'Слишком много попыток входа. Попробуйте позже.':
    'Too many sign-in attempts. Try again later.',
  'Слишком часто. Попробуйте через минуту.': 'Too fast. Try again in a minute.',

  /* --- цели питания: уровни активности и пресеты макросов --- */
  Сидячий: 'Sedentary',
  Лёгкий: 'Light',
  Высокий: 'High',
  'Очень высокий': 'Very high',
  'Работа за столом, тренировок нет': 'Desk job, no training',
  '1–3 тренировки в неделю': '1–3 workouts a week',
  '3–5 тренировок в неделю': '3–5 workouts a week',
  '6–7 тренировок в неделю': '6–7 workouts a week',
  'Физический труд или две тренировки в день': 'Manual labour or two workouts a day',
  Сбалансированно: 'Balanced',
  Сушка: 'Cutting',
  'Набор массы': 'Bulking',
  'Мало углеводов': 'Low carb',

  /* --- расчёт расхода: фразы вокруг чисел собираются кусками --- */
  'Расход выведен из того, сколько вы ели и как менялся вес за последние':
    'Expenditure is derived from what you ate and how your weight changed over the last',
  'Вес меняется на': 'Weight is changing by',
  'кг в неделю': 'kg a week',
  'Пока это оценка по формуле': 'For now this is a formula estimate',
  'Заполните дневник и вес хотя бы': 'Fill in the diary and your weight for at least',
  'расчёт перейдёт на ваши реальные данные и учтёт замедление обмена':
    'the calculation will switch to your own data and account for a slowing metabolism',
  'Точность расчёта': 'Calculation confidence',
  'Цель и макросы заданы им, поэтому расчёт приложения на них не влияет. Свои настройки заработают, когда тренер снимет норму.':
    'The target and macros are set by them, so the app’s own calculation does not affect them. Your settings will take over once the trainer lifts the target.',

  /* --- способы связи: подписи полей в профиле --- */
  Телефон: 'Phone',
  /* «Почта» уже есть выше — способ связи и раздел настроек называются
     одинаково, и перевод у них один. */
  'имя пользователя без «собаки»': 'username without the “at” sign',
  'имя пользователя': 'username',
  'номер телефона': 'phone number',
  'для звонка и СМС': 'for calls and texts',
  'если удобнее письмом': 'if email suits you better',

  /* --- питание: единицы и подставленные приложением названия --- */
  шт: 'pcs',
  'Приём пищи': 'Meal',

  /* --- выгрузка в CSV: файл открывают в таблице --- */
  Подход: 'Set',
  Повторения: 'Reps',
  Рекорд: 'Record',
  да: 'yes',

  /* --- день программы, собранной приложением --- */
  'День 1': 'Day 1',

  /* --- обмен не доходит --- */
  'Данные не уходят на сервер': 'Data is not reaching the server',
  'Данные для клиента не уходят': 'Data for a client is not being sent',
  'Сервер не принимает изменения. Написанное сохранено и уедет, как только он снова начнёт их принимать, — ничего не пропадёт.':
    'The server is refusing changes. Everything you wrote is saved and will be sent as soon as it accepts them again — nothing is lost.',
  'Сервер не считает этого человека вашим клиентом — проверьте связь в его карточке. Сообщения и назначения сохранены и уедут, когда связь восстановится.':
    'The server does not treat this person as your client — check the link on their card. Messages and assignments are saved and will be sent once the link is restored.',

  'Опишите ограничения или выберите «Нет»': 'Describe the limitations or choose “No”',

  /* --- дни рождения клиентов --- */
  'Скоро дни рождения': 'Birthdays soon',
  'сегодня ДР': 'birthday today',
  'ДР через': 'birthday in',
  через: 'in',

  /* --- стартовая анкета --- */
  Пол: 'Sex',
  Женский: 'Female',
  Мужской: 'Male',
  'Дата рождения': 'Date of birth',
  шея: 'neck',
  'Опытный, 12+ мес': 'Experienced, 12+ months',
  'Профи, 2+ года': 'Pro, 2+ years',
  'Есть ли травмы, противопоказания, ограничения?':
    'Any injuries, contraindications or limitations?',
  'Есть, опишу': 'Yes, I will describe',
  'Что беспокоит и чего избегать': 'What hurts and what to avoid',
  'Отправить анкету': 'Send the form',
  'Анкета заполнена': 'Form completed',
  'Как комфортнее, чтобы к вам обращались? Можно несколько вариантов.':
    'How would you like to be addressed? More than one option is fine.',
  'Как удобнее общаться: коротко и по делу или с поддержкой и заботой?':
    'How should we talk: short and to the point, or with care and encouragement?',
  'Что может снизить вашу мотивацию?': 'What could sap your motivation?',
  'Если устали и мотивация упала — как вас поддержать? Какими словами?':
    'If you are tired and motivation drops — how should we support you? In what words?',
  'Какой цели хотите достичь? Как поймёте, что достигли её?':
    'What goal do you want to reach? How will you know you have reached it?',
  'Почему решили обратиться именно ко мне и почему именно сейчас?':
    'Why did you come to me, and why now?',

  /* --- задания: фото до/после, проверка у тренера, архив --- */
  'Фото до/после': 'Before/after photos',
  'Фото в белье или купальнике, при дневном свете, камера на уровне пупка. Четыре кадра: спереди, с двух боков и сзади.':
    'Photos in underwear or swimwear, in daylight, camera at navel height. Four shots: front, both sides and back.',
  Фотографии: 'Photos',
  Спереди: 'Front',
  'Сбоку слева': 'Left side',
  'Сбоку справа': 'Right side',
  Сзади: 'Back',
  'Фото добавлено': 'Photo added',
  'Ждут проверки': 'Awaiting review',
  'ждут проверки': 'awaiting review',
  Принять: 'Accept',
  'Задание принято': 'Task accepted',
  'Выданные задания': 'Assigned tasks',
  'Всё выполнено.': 'All done.',
  'Сданные задания': 'Submitted tasks',
  Принято: 'Accepted',
  Сданное: 'Submitted',
  'Заданий пока не сдано.': 'No tasks submitted yet.',
  'Отчёт за сегодня сдан': 'Today’s report is submitted',
  'Можно поправить в дневнике': 'You can still edit it in the diary',
  'Замеры за неделю': 'Measurements for the week',
  'Обхваты и вес — раз в неделю, чтобы видеть динамику.':
    'Girths and weight once a week, so the trend is visible.',
  'Сделайте замер и загрузите PDF из зала — состав тела разберётся сам.':
    'Get scanned and upload the gym’s PDF — the body composition is parsed for you.',

  /* --- прогресс в фото: серии по датам, сравнение и коллаж --- */
  'Прогресс в фото': 'Photo progress',
  'Серии по датам и сравнение любых двух': 'Series by date, any two compared',
  'Серии по датам, сравнение и коллаж «было / стало»':
    'Series by date, comparison and a before/after collage',
  'Снять серию': 'Take a series',
  'День съёмки': 'Day of the shoot',
  Сравнение: 'Comparison',
  Было: 'Before',
  Стало: 'After',
  'между съёмками': 'between the shoots',
  '— это одна съёмка': '— that is one shoot',
  Коллаж: 'Collage',
  Серии: 'Series',
  'из 4 ракурсов': 'of 4 angles',
  'из задания': 'from a task',
  'Кадра нет': 'No shot',
  'Сохранить картинку': 'Save the image',
  'Написать тренеру': 'Message the trainer',
  'Тренер получит сообщение': 'Your trainer will get the message',
  'Фото прогресса': 'Progress photos',
  'Все серии фото': 'All photo series',
  'Картинку можно сохранить и отправить куда угодно — она собирается сама.':
    'The image builds itself — save it and send it anywhere.',
  'Картинку можно сохранить и показать клиенту.': 'You can save the image and show it to the client.',
  'Коллаж не собрался — нет ни одного кадра.': 'No collage — there is not a single shot.',
  'Клиент ещё не снимал фото прогресса.': 'The client has taken no progress photos yet.',
  'Снимков пока нет. Снимите первую серию — с ней и будете сравнивать через месяц.':
    'No shots yet. Take the first series — that is what you will compare against in a month.',
  'Эти кадры сняты по заданию «Фото до/после» — они и есть точка отсчёта.':
    'These shots came from the before/after task — they are the starting point.',

  /* --- питание: сдача ручного отчёта и разбор --- */
  'Разбор дня': 'Day review',
  'День питания не сдан': 'Nutrition day not submitted',
  'Записи есть — отправьте отчёт тренеру': 'You have entries — send the report to your trainer',
  'Что съедено': 'What was eaten',

  /* --- завершение тренировки у онлайн-клиента: выбор из трёх --- */
  'Сдать видео-отчёт': 'Submit video report',
  'Сдать без видео': 'Submit without video',
  'Напомнить позже': 'Remind me later',
  'Прикрепите хотя бы одно видео выше': 'Attach at least one video above',
  'Тренировка сохранена — отчёт ждёт в «Отчётах»':
    'Workout saved — the report is waiting in Reports',
  'Отчёт по тренировке не сдан': 'A workout report is still unsubmitted',
  'Вы отложили сдачу — можно сдать сейчас': 'You put it off — you can submit it now',

  /* --- разбор тренировки у тренера --- */
  'Отправить и отметить разобранным': 'Send and mark reviewed',
  'Отправлено, тренировка разобрана': 'Sent, workout reviewed',
  'Тренировка разобрана': 'Workout reviewed',
  'Приложить фото': 'Attach a photo',

  /* --- переписка по упражнению --- */
  'История комментариев': 'Comment history',
  'Пока ничего не сказано': 'Nothing said yet',

  /* --- шаги и сон: сданный день показывается итогом, а не формой --- */
  'Записано за сегодня': 'Recorded today',
  записано: 'recorded',
  'не введено': 'not entered',

  /* --- обязательные задания: выдаются при привязке к тренеру --- */
  'Стартовая анкета': 'Intake form',
  'Рост, вес, замеры и опыт тренировок — с этого начинается работа.':
    'Height, weight, measurements and training experience — this is where the work starts.',
  'Зачем мне это': 'Why I want this',
  // Прежний текст задания. Остаётся в словаре: он записан в заданиях, уже
  // выданных клиентам, и с их строк никуда не денется.
  'Опиши подробно свою ситуацию сейчас. Как себя чувствуешь? Эмоции? Общее состояние? Уровень энергии? Уровень удовлетворения от текущего состояния? Дальше ответь на вопрос: зачем я хочу изменить тело и привычки и как изменится моя жизнь, когда получится? Сохрани и отправь нам — будем возвращаться к этому в трудные моменты.':
    'Describe your situation right now in detail. How do you feel? Emotions? General state? Energy level? How satisfied are you with where you are? Then answer this: why do I want to change my body and habits, and how will my life change once I do? Save it and send it to us — we will come back to it on the hard days.',
  'Ответь себе письменно: зачем я хочу изменить тело и привычки и как изменится моя жизнь, когда получится? Сохрани и отправь нам — будем возвращаться к этому в трудные моменты.':
    'Answer in writing: why do I want to change my body and habits, and how will my life change once I do? Save it and send it to us — we will come back to it on the hard days.',
  'Первые замеры': 'First measurements',
  'Дальше — еженедельно.': 'Weekly from then on.',
  'Анализ состава тела InBody': 'InBody body composition scan',

  /* --- ошибки входа и регистрации: приходят с сервера, показываются как есть --- */
  'Вход устарел — войдите ещё раз': 'Your session expired — sign in again',
  'Неверная почта или пароль': 'Wrong email or password',
  'Не удалось связаться с сервером': 'Could not reach the server',
  'Подтверждение пароля': 'Password confirmation',
  'уже занята': 'is already taken',
  // $1 подставляет регулярное выражение уже после перевода — цифру нужно
  // сохранить и в английской строке.
  'минимум $1 символов': 'at least $1 characters',
  'нужен настоящий адрес': 'needs a real address',
  'заполните поле': 'fill in the field',
  'пароли не совпадают': 'passwords do not match',

  /* --- коды приглашений --- */
  'Код не отозвался на сервере — проверьте связь и попробуйте снова':
    'The code was not revoked on the server — check your connection and try again',
  Отдых: 'Rest',
  далее: 'next',
  'Все аккаунты живут в одной локальной базе — так связку тренер↔клиент видно без сервера.':
    'All accounts live in one local database — that is how the trainer↔client link works without a server.',
  'Чат появится, когда вы начнёте работать с тренером. Код приглашения вводится в профиле.':
    'The chat appears once you start working with a trainer. The invite code goes in your profile.',
  'От тренера': 'From your trainer',
  для: 'for',
  клиента: 'client',

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

  /* --- уборка за демо-режимом: раздел виден, только пока есть что убрать --- */
  'Демонстрационные данные': 'Demo data',
  'В аккаунте лежат данные из демо-режима: их завело приложение, а не вы. Тренер видит их наравне с настоящими.':
    'Your account holds data from the demo mode: the app made it up, you did not. Your coach sees it as real.',
  'Убрать демо-данные': 'Remove demo data',
  'Будет убрано:': 'Will be removed:',
  'Поля профиля не подменяем правдоподобными — освобождаем: правильные значения знаете только вы, и приложение спросит их заново.':
    'Profile fields are cleared, not replaced with plausible numbers: only you know the right ones, and the app will ask again.',
  'Удаление уезжает на сервер фоном — у тренера и на других ваших устройствах эти строки пропадут в течение нескольких минут.':
    'The deletion goes up in the background — the rows disappear for your coach and on your other devices within a few minutes.',
  Убрать: 'Remove',
  'Убираю…': 'Removing…',
  'Демо-данные убраны': 'Demo data removed',
  'Не удалось убрать — попробуйте ещё раз': 'Could not remove — try again',
  Тренировок: 'Workouts',
  'подходов в них': 'sets in them',
  Замеров: 'Measurements',
  'В профиле': 'In the profile',
  'Выдуманные клиенты': 'Made-up clients',
  имя: 'name',
  пол: 'sex',
  рост: 'height',
  'обхват шеи': 'neck girth',
  'целевой вес': 'goal weight',
  уровень: 'level',

  /* --- снятие выданного задания --- */
  'Удалить задание': 'Delete task',
  'Снять задание': 'Withdraw task',
  'Снимаю…': 'Withdrawing…',
  'Задание снято': 'Task withdrawn',
  'Клиент перестанет его видеть.': 'The client will stop seeing it.',
  'Обязательное задание. Оно вернётся, если связь с клиентом оформят заново.':
    'A required task. It comes back if the client is linked again.',
  'Приложенных файлов': 'Attached files',
  'Они останутся у клиента, но открыть их будет неоткуда — задания, из которого они видны, не станет.':
    'They stay with the client, but there will be no way to open them — the task they show up in is gone.',
  'Не удалось снять задание — попробуйте ещё раз': 'Could not withdraw the task — try again',

  /* --- сборка программы: порядок и комментарий к упражнению --- */
  Переставить: 'Reorder',
  'Тяните или меняйте порядок стрелками': 'Drag, or reorder with arrow keys',
  'Не удалось сохранить порядок — попробуйте ещё раз': 'Could not save the order — try again',
  'Добавить комментарий': 'Add a comment',
  'Изменить комментарий': 'Edit the comment',
  'Что важно в этом упражнении': 'What matters in this exercise',
  'Например: пауза внизу секунду, последний подход до отказа':
    'For example: one second pause at the bottom, last set to failure',
  'Клиент увидит это в программе и на тренировке, у самого упражнения.':
    'The client sees this in the program and during the workout, right at the exercise.',
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
  замер: ['measurement', 'measurements'],
  неделю: ['week', 'weeks'],
  файл: ['file', 'files'],
  скриншот: ['screenshot', 'screenshots'],
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
 * Локаль для `toLocaleDateString` и подобных.
 *
 * Даты идут мимо словаря: их собирает браузер, и «14 августа» посреди
 * английского экрана словарь уже не перехватит — локаль нужно задать в
 * самом вызове.
 */
export const locale = (): string => (current === 'en' ? 'en-GB' : 'ru-RU')

/**
 * Дробная часть: у русского запятая, у английского точка.
 *
 * Числа собираются в строку вручную (`toFixed`), поэтому разделитель
 * приходится ставить тоже вручную — иначе «86,8 т» уезжает в английский.
 */
export const decimal = (s: string): string =>
  current === 'en' ? s.replace(',', '.') : s.replace('.', ',')

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
