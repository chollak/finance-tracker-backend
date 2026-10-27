# Веха 10 — перенос «Пастели»: задачи

**Здесь — только открытые задачи вехи.** Закрытые (50 из 57) с отчётами «Реализовано / Проверка» — в
[`docs/tasks/archive/ft-087-143-pastel.md`](../tasks/archive/ft-087-143-pastel.md). Веха слита в `main` PR #90 2026-10-26.

Задачи вехи 10 в формате [`docs/tasks/README.md`](../tasks/README.md), с дополнительными полями
`Depends`, `Size` и `Design`. Решения Д1–Д7 из [README](README.md) приняты 2026-10-16. Открытые задачи ждут
телефона, настоящих чеков или «да» Шукура — что именно, видно в таблице вехи в `TASKS.md`; когда задачу берут в
работу, её тело переезжает в `TASKS.md`.

- **Порядок задаёт `Depends`, номер — только рекомендуемая очерёдность.** Задачу можно брать, когда закрыто
  всё из её `Depends` и нет блокирующего решения.
- `blocked` — только когда задача ждёт решения Шукура (как в правилах доски). Ожидание другой задачи видно
  по `Depends`, статус при этом `backlog`.
- Задачи, которые раньше ждали решений: FT-090 (Д6), FT-091 (Д3), FT-099 (Д5, Д2), FT-108 (Д7), FT-110 (Д1),
  FT-124 (Д2, Д3), FT-125 (Д2), FT-128 (Д4). Решения записаны в `docs/tasks/decisions.md`.
- Размер: **S** — до дня работы, **M** — 2–3 дня, **L** — около недели. Оценка грубая, вместе с проверкой.
- После каждой задачи приложение работает: старый экран удаляется в той задаче, которая его заменяет.
- Экран сверяют скриншотом с доской холста из поля `Design`, в светлой и тёмной теме.

---

## Фаза 0. Подготовка

Закрыты: FT-087, FT-090, FT-091 — в архиве.

### FT-088: Spike voice recording inside Telegram Mini App

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: spike
Size: S
Design: «Голосовой ввод», «Нет доступа к микрофону», «Микрофон в браузере»

Context:
В дизайне голос записывается в mini app. Неизвестно, даст ли WebView Telegram микрофон на iOS, Android и
Desktop и в каком формате придёт звук. От ответа зависит FT-117.

Definition of Done:
- [ ] Тестовая страница за туннелем пишет 5 секунд через `getUserMedia` + `MediaRecorder` и шлёт в `POST /api/voice/voice-input`
- [ ] Таблица: iOS, Android, Desktop, браузер — разрешение, формат, распознал ли Whisper
- [ ] Вывод в `docs/tasks/decisions.md`: голос в mini app везде / с запасным «Голосовое — в чат бота» / не делаем

### FT-089: Spike fiscal receipt QR and photo recognition

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: spike
Size: S
Design: ряд «Фото чека»

Context:
QR фискального чека ведёт на `https://ofd.soliq.uz/check?t=…`; открытого API нет. Для чеков без QR нужен
разбор фото моделью с vision. От ответа зависят FT-134 и FT-135.

Definition of Done:
- [ ] На 10 реальных чеках: получаются ли по ссылке из QR магазин, дата и время, позиции, итог
- [ ] Те же чеки по фото: точность итога и позиций, время ответа, цена запроса
- [ ] Вывод в `docs/tasks/decisions.md`: QR + фото / только фото / откладываем чек

---

## Фаза 1. Основа интерфейса — закрыта (FT-092…FT-096), в архиве

---

## Фаза 2. Модель денег (backend)

Схема и правила — [money-model.md](money-model.md). Закрыты: FT-097…FT-107 — в архиве.

### FT-108: Apply historical semantic backfill

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: data
Size: S
Depends: FT-090

Context:
Все старые записи — `semanticType = expense` (backfill из FT-045 не применён), поэтому прежние переводы
себе и снятия наличных считаются расходами в аналитике прошлых месяцев.

Definition of Done:
- [ ] Превью FT-045 пересобрано и показано Шукуру списком
- [ ] Миграция применяет только одобренные строки; копия базы до неё
- [ ] Итоги прошлых месяцев до и после — в отчёте

---

## Фаза 3. Ввод и исправление

Закрыты: FT-109…FT-116 и добавленные в фазу FT-137…FT-143 — в архиве.

### FT-117: Voice capture inside the Mini App

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-088, FT-114
Design: «Голосовой ввод», «Нет доступа к микрофону», «Микрофон в браузере», «Ничего не расслышал»

Definition of Done:
- [ ] Объём — по выводу FT-088
- [ ] Запись, «Расслышал: «…»», переход к проверке
- [ ] Нет доступа: как включить и «Написать текстом» (в браузере — свой текст); не расслышал: пример фразы и «Ещё раз»

---

## Фаза 4. Счета — закрыта (FT-118, FT-119), в архиве

## Фаза 5. Аналитика — закрыта (FT-120, FT-121), в архиве

## Фаза 6. Бот — закрыта (FT-122…FT-124), в архиве

## Фаза 7. Сквозное — закрыта (FT-125…FT-129), в архиве

## Фаза 8. Ревизия и цели — закрыта (FT-130…FT-133), в архиве

---

## Фаза 9. Чек

### FT-134: Receipt recognition backend

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: feature
Size: L
Depends: FT-089, FT-099, FT-103, FT-105

Definition of Done:
- [ ] Объём — по выводу FT-089
- [ ] Черновик из QR или фото: магазин, дата и время, итог, позиции, источник (QR — точно, фото — сверить)
- [ ] Разделение по категориям: записей столько, сколько групп, в сумме — итог; позиции в `transaction_items`
- [ ] Та же сумма в тот же день и близко по времени создания → «Дополнить запись»; тот же чек дважды не записывается (`receipt_ref`)
- [ ] Разделение записи из бота: исходная запись заменяется группами, отмена возвращает исходную
- [ ] Размыто, нет итога, не чек — отдельные ответы

### FT-135: Receipt screens and bot photo flow

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-114, FT-122, FT-134
Design: ряд «Фото чека — от камеры до записи»

Definition of Done:
- [ ] Подсказки первые 3 раза (счётчик в настройках), системная камера или галерея (на компьютере — «Выбрать файл»), чтение с отменой
- [ ] Проверка, разделение, «уже записано»; ошибки с выходом «Ввести вручную»
- [ ] После сохранения — главная с подсвеченными записями и Toast с отменой
- [ ] Фото в бота: та же логика, ответ в формате подтверждения

---

## Фаза 10. Уборка

### FT-136: Remove transition leftovers

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: repo-hygiene
Size: S
Depends: все задачи вехи

Definition of Done:
- [ ] Удалены `transactions.amount` и `legacy_category`, backend `dashboard`, статический `Category.ts` (кроме стартовых пресетов), неиспользуемые виджеты и хуки webapp
- [ ] Удалены гостевые ветки backend (`guest_*`, решение Д4, ревью FT-128): `allowGuestMode`, `verifyOwnership` в `authMiddleware.ts`, `userIdResolver.ts`, `userResolutionMiddleware.ts`, `ownershipVerification.ts`, `subscriptionController.ts`, `transactionController.ts`; запрос без входа к `/api/dashboard/guest_abc/quick-stats` получает 401
- [ ] Документация (`knowledge-base`, `CLAUDE.md`) описывает новую модель
- [ ] `npm run verify` проходит
