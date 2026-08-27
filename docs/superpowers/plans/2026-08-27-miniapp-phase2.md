# Новый мини-апп: фаза 2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить мини-апп на три экрана с явной иерархией: посмотреть записанное, добавить одной строкой, поправить ошибку парсера.

**Architecture:** Новый проект рядом со старым, плоская структура без Feature-Sliced Design. Переносится только водопровод — инициализация Telegram, HTTP-клиент, типы, форматтеры. Цифры для главного экрана считаются на клиенте: `/api/dashboard` заморожен, а живая аналитика фильтрует иначе, чем бот, и разошлась бы в суммах.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind, TanStack Query. Сборка в `public/webapp/`, раздаётся с корня Express.

**Спека:** [2026-08-26-capture-core-design.md](../specs/2026-08-26-capture-core-design.md)
**Промпт для дизайна:** [2026-08-27-miniapp-design-prompt.md](../2026-08-27-miniapp-design-prompt.md)
**Предыдущая фаза:** [2026-08-26-capture-core-backend.md](2026-08-26-capture-core-backend.md) — фазы 0 и 1 выполнены

**Не входит:** Apple Shortcuts, хостинг, размораживание бюджетов, долгов и аналитики.

---

## Что выяснил разбор бэкенда

Факты ниже проверены по коду и определяют половину решений в плане.

**Живых префиксов три:** `/transactions`, `/voice`, `/users`. Всё остальное заморожено.

**Авторизация одна:** заголовок `Authorization: tma <initData>`, HMAC-SHA256, срок годности **3600 секунд**. Вне production работает обход `X-Dev-User-Id: <telegramId>` — но этого заголовка **нет в CORS allow-list**, так что из браузера он не пройдёт.

**Всегда слать telegramId, а не UUID.** Если в путь `/transactions/user/:userId` подставить UUID, `userResolutionMiddleware` выставит `telegramId: null`, и `verifyOwnership` пропустит проверку владения целиком. То есть UUID в пути — это обход собственной защиты.

**Пагинации нет.** `GET /transactions/user/:userId` игнорирует query и возвращает всю неархивную историю одним массивом.

**Ошибки приходят в двух форматах:** контроллеры отдают `error` объектом `{code, message}`, middleware — строкой плюс отдельное поле `code`. Текущий клиент читает несуществующее `errorData.message`, поэтому любая ошибка схлопывается в «Request failed», а код теряется.

---

## Структура нового проекта

```
webapp-next/
  index.html
  vite.config.ts
  tailwind.config.ts        (или @theme в css)
  src/
    main.tsx                точка входа, инициализация Telegram
    styles.css              токены и базовые стили
    api/
      client.ts             fetch-обёртка, разбор обоих форматов ошибок
      transactions.ts       запросы и мутации TanStack Query
    lib/
      money.ts              форматирование сумм
      dates.ts              UTC-границы дня, недели, месяца
      summary.ts            расчёт месяца и недельных столбиков
      semanticType.ts       что считается расходом
      telegram.ts           доступ к window.Telegram.WebApp
    screens/
      Home.tsx
      Add.tsx
      Edit.tsx
    components/
      SummaryCard.tsx
      WeekBars.tsx
      DayGroup.tsx
      TransactionRow.tsx
      AddButton.tsx
```

Слоёв нет. Они вводятся, когда появляется боль от их отсутствия.

`webapp/` остаётся на месте до последней задачи — чтобы было с чем сравнивать и куда подсмотреть.

---

## Задача 1: Закрыть POST /api/transactions

**Files:**
- Modify: `src/modules/transaction/presentation/controllers/transactionController.ts:212-217`
- Modify: `src/frozen.ts`
- Test: `tests/transactionCreateRouteFrozen.test.ts` (создать)

**Суть.** У маршрута нет авторизации: в цепочке только `resolveUser`, который берёт `userId` из тела и пропускает дальше. Ни проверки `initData`, ни проверки владения. Анонимный запрос с чужим `userId` создаёт запись в чужом аккаунте.

Дыра не новая — конструкция существует и до заморозки подписок, `createIncrementUsageMiddleware` аутентификацией никогда не занимался.

**Решение — заморозить маршрут, а не чинить.** Новому мини-аппу он не нужен: захват идёт через `/voice/text-input`, где авторизация есть. Ручное создание без разбора текста в продукте больше не предусмотрено — экран добавления это одно текстовое поле.

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/transactionCreateRouteFrozen.test.ts
import { FROZEN_ROUTES } from '../src/frozen';

describe('POST /api/transactions', () => {
  it('числится замороженным', () => {
    // Маршрут не имел авторизации: только resolveUser, который берёт userId
    // из тела и пропускает дальше. Продукту он не нужен — захват идёт через
    // /voice/text-input, где есть allowGuestMode.
    expect([...FROZEN_ROUTES]).toContain('POST /transactions');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/transactionCreateRouteFrozen.test.ts`

- [ ] **Step 3: Снять регистрацию**

В `transactionController.ts` убрать блок `router.post('/', ...)` целиком, оставив над этим местом комментарий с датой, причиной и условием разморозки: вернуть можно только вместе с `allowGuestMode` + `verifyOwnership`.

Добавить `'POST /transactions'` в `FROZEN_ROUTES` (`src/frozen.ts`) и описать причину там же, рядом с описанием заморозки подписок.

- [ ] **Step 4: Проверить, что живое не задето**

Run: `npm run build && npm run test:ci`
Затем вручную:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d '{"amount":1,"category":"other","description":"x","type":"expense","userId":"whoever"}' \
  http://localhost:3000/api/transactions
```

Expected: `404`. А `POST /api/voice/text-input` по-прежнему `401` без авторизации.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "fix(api): закрыть создание транзакций без авторизации"
```

---

## Задача 2: Дизайн трёх экранов

**Files:**
- Артефакт канвы, файлов в репозитории не создаёт

**Суть.** Визуальные решения принимаются до кода: подвигать отступы и размеры руками быстрее, чем описывать словами и пересобирать. Предыдущая версия умерла в том числе от того, что на неё надоело смотреть, а это провал иерархии.

- [ ] **Step 1: Запустить канву**

Использовать промпт из `docs/superpowers/2026-08-27-miniapp-design-prompt.md` без правок — числа и категории в нём настоящие, из базы.

- [ ] **Step 2: Проверить главное ограничение**

Убедиться, что главный экран показан в двух состояниях: с суммами порядка `25 000` и порядка `54 000 000`. Композиция обязана держать оба без переносов и прыжков.

- [ ] **Step 3: Проверить, что ничего лишнего не приехало**

На макетах не должно быть: бюджетов, долгов, аналитики по категориям, вкладок внизу, четвёртого экрана. Появилось — значит размораживаем через дизайн, мимо всех решений.

- [ ] **Step 4: Зафиксировать токены**

Из утверждённого макета выписать в задачу 3: палитру, размеры шрифта для трёх уровней иерархии, отступы, радиусы. Это вход для `styles.css`.

---

## Задача 3: Каркас проекта

**Files:**
- Create: `webapp-next/` — `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`, `src/main.tsx`, `src/styles.css`

- [ ] **Step 1: Поднять пустой Vite-проект**

React + TypeScript. Сборка обязана класть результат туда же, куда старая — иначе Express не найдёт:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../public/webapp', emptyOutDir: true },
});
```

- [ ] **Step 2: Перенести ассеты**

`webapp/public/fonts/` (4 файла woff2 + OFL.txt), `webapp/public/icons/`, `manifest.json`.

**Пути к шрифтам обязаны остаться абсолютными от корня** (`/fonts/onest-*.woff2`): Express раздаёт `public/webapp` с корня `/`, а `/webapp/*` — только 301-редирект.

- [ ] **Step 3: Подключить Telegram**

В `index.html` — тег `<script src="https://telegram.org/js/telegram-web-app.js"></script>` и viewport, как в старом `webapp/index.html`.

- [ ] **Step 4: Токены из макета**

Перенести в `styles.css` палитру и шкалы, выписанные в задаче 2. Светлая и тёмная тема обе.

- [ ] **Step 5: Проверить сборку**

Run: `cd webapp-next && npm install && npm run build`
Expected: сборка проходит, в `public/webapp/` появился `index.html`.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "chore(webapp): каркас нового мини-аппа"
```

---

## Задача 4: Перенос водопровода

**Files:**
- Create: `webapp-next/src/lib/telegram.ts`, `src/lib/money.ts`, `src/api/client.ts`, `src/types.ts`

Переносится дословно (проверено разбором — зависимостей не тянут):
`shared/config/env.ts`, `shared/lib/haptic.ts`, `shared/lib/utils.ts` (`cn`), `shared/lib/plural.ts`,
`app/providers/QueryProvider.tsx`.

- [ ] **Step 1: Перенести и урезать типы Telegram**

`shared/types/telegram.ts` — 181 строка, из которых реально используются `initData`,
`initDataUnsafe.user`, `ready`, `expand`, `HapticFeedback`. `MainButton`, `BackButton`,
`CloudStorage`, `themeParams`, `safeAreaInset` не вызываются нигде. Оставить около сорока строк.

- [ ] **Step 2: Написать падающий тест на разбор ошибок**

Это обязательная правка, а не косметика: сервер отвечает ошибкой в двух форматах, а старый
клиент читает несуществующее поле `errorData.message`, из-за чего всё схлопывается
в «Request failed» и код ошибки теряется.

```typescript
// webapp-next/src/api/client.test.ts
describe('разбор ошибки сервера', () => {
  it('понимает формат контроллеров (error — объект)', async () => {
    // { success:false, error:{ code:'VALIDATION_ERROR', message:'Text is required' } }
    // ожидание: message = 'Text is required', code = 'VALIDATION_ERROR'
  });

  it('понимает формат middleware (error — строка)', async () => {
    // { success:false, error:'Invalid authentication', code:'INVALID_AUTH' }
    // ожидание: message = 'Invalid authentication', code = 'INVALID_AUTH'
  });

  it('не теряет код ошибки — на нём строится обработка 401 и 429', async () => {
    // ожидание: code доступен вызывающему в обоих форматах
  });
});
```

- [ ] **Step 3: Реализовать клиент**

```typescript
const body = await response.json().catch(() => ({} as Record<string, unknown>));
const message =
  typeof body.error === 'string' ? body.error : (body.error as any)?.message ?? 'Не удалось выполнить запрос';
const code = typeof body.error === 'string' ? body.code : (body.error as any)?.code;
throw Object.assign(new Error(message), { code, statusCode: response.status });
```

Заголовок авторизации: `Authorization: tma ${initData}`.

`upload()` и `API_ENDPOINTS.VOICE` из старого клиента не переносить — голосовой ввод во фронте
не подключён ни разу.

- [ ] **Step 4: Дополнить типы транзакции**

Старый `shared/types/transaction.ts` отстал от того, что реально отдаёт API. Добавить:
`isDebtRelated: boolean`, `relatedDebtId?: string`, `source?: 'telegram' | 'shortcut' | 'webapp'`,
а в `originalParsing` — `semanticType` и `needsReview`.

- [ ] **Step 5: Тесты и коммит**

```bash
git add -A
git commit -m "feat(webapp): перенести водопровод и починить разбор ошибок"
```

---

## Задача 5: Инициализация пользователя

**Files:**
- Modify: `webapp-next/src/main.tsx`
- Create: `webapp-next/src/lib/telegram.ts`

**Суть.** Старый `UserInitializer` — 88 строк, из которых нужна одна ветка. Остальные три
(dev-mock, восстановление сессии из zustand-persist, создание гостя с `initDatabase()`)
обслуживают гостевой режим, которого в новом приложении нет.

`HydrationGate` не переносится вовсе: он существовал потому, что `userId` лежал в persisted-хранилище.
В Telegram `initDataUnsafe.user.id` доступен синхронно на первом рендере — причина гейта исчезла.

- [ ] **Step 1: Реализовать**

```typescript
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const telegramId = tg?.initDataUnsafe?.user?.id;
const initData = tg?.initData;
```

Если `telegramId` нет — показать экран «Откройте приложение через Telegram» и не пытаться
ходить в API. Это единственный поддерживаемый способ запуска.

- [ ] **Step 2: Проверить порядок операций**

Первым запросом обязан идти список транзакций: он резолвит telegramId через `getOrCreateUser`
и тем самым создаёт пользователя. `PUT` и `DELETE` используют `GetUserUseCase`, который
не создаёт, и вернут 403 для пользователя, которого ещё нет в БД.

- [ ] **Step 3: Коммит**

```bash
git add -A
git commit -m "feat(webapp): инициализация пользователя из Telegram"
```

---

## Задача 6: Расчёт цифр — ядро корректности

**Files:**
- Create: `webapp-next/src/lib/semanticType.ts`, `src/lib/dates.ts`, `src/lib/summary.ts`
- Test: `webapp-next/src/lib/summary.test.ts`

**Это самая важная задача фазы.** Если мини-апп покажет сумму, отличную от той, что показывает
бот, доверие к продукту кончится быстрее, чем от любой задержки.

**Правило расхода — ровно одно:** `semanticType === 'expense'` И `needsReview !== true`.

Три запрета, каждый из которых уже разъезжался в этом проекте:

1. **Не откатываться на `type === 'expense'`.** Оба репозитория нормализуют `semanticType`
   на выходе, поле всегда заполнено. Фолбэк вернул бы `own_transfer` и `cash_withdrawal`
   в расходы — у них `type: 'expense'`.
2. **Не добавлять фильтр по `isDebtRelated`.** Бот его не применяет. Клиент, который применит,
   разойдётся с ботом на старых записях.
3. **Не фильтровать `isArchived`** — репозитории уже отдают только неархивные.

**Границы дня считать по UTC.** `normalizeTransactionDate` везде использует
`toISOString().split('T')[0]`, поэтому календарный день системы — UTC-день. Запись, сделанная
в Ташкенте в 02:00, имеет вчерашнюю `date`.

**Сравнивать строками, никогда не через `new Date(tx.date).getDate()`.**
День: `tx.date === '2026-08-27'`. Месяц: `tx.date.slice(0, 7) === '2026-08'`.

- [ ] **Step 1: Перенести готовую функцию**

`isNonExpenseMovement` из `webapp/src/entities/transaction/lib/semanticType.ts:50` уже написана
и верна. Перенести её, а не писать заново. Импорт `BadgeProps` из shadcn выкинуть.

- [ ] **Step 2: Написать тесты до реализации**

```typescript
describe('что считается расходом', () => {
  // Таблица из восьми семантических типов: расходом является ровно один.
  it.each([
    ['expense', true],
    ['income', false],
    ['own_transfer', false],
    ['saving_deposit', false],
    ['debt', false],
    ['reimbursement', false],
    ['cash_withdrawal', false],
    ['group_payment', false],
  ])('%s → расход: %s', (semanticType, expected) => { /* ... */ });

  it('needsReview исключает запись независимо от типа', () => { /* ... */ });

  it('не полагается на type: own_transfer с type expense расходом не является', () => { /* ... */ });
});

describe('границы периодов', () => {
  it('сегодня определяется по UTC, а не по локали браузера', () => { /* ... */ });
  it('месяц сравнивается по префиксу строки даты', () => { /* ... */ });
  it('неделя — семь строк-дат шагом по UTC-дням', () => { /* ... */ });
});

describe('сводка', () => {
  it('совпадает с тем, что считает бот на том же наборе', () => {
    // Набор из карточки бота: 45000 expense + 500000 own_transfer + 400000 needsReview
    // ожидание: 45000, а не 945000
  });
});
```

- [ ] **Step 3: Реализовать и прогнать**

- [ ] **Step 4: Проверить мутацией**

Убрать проверку `needsReview` — тест обязан упасть. Заменить `semanticType` на `type` — обязан упасть.
Если не падает, тест ничего не охраняет.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "feat(webapp): считать расходы по тем же правилам, что и бот"
```

---

## Задача 7: Главный экран

**Files:**
- Create: `webapp-next/src/screens/Home.tsx`, `src/components/SummaryCard.tsx`, `WeekBars.tsx`, `DayGroup.tsx`, `TransactionRow.tsx`, `AddButton.tsx`
- Create: `webapp-next/src/api/transactions.ts`

**Данные:** один запрос `GET /api/transactions/user/:telegramId`, всё остальное считается на клиенте.

- [ ] **Step 1: Запрос списка**

TanStack Query. В путь идёт **telegramId**, не UUID — при UUID проверка владения пропускается.

- [ ] **Step 2: Собрать экран из трёх зон**

Сумма за месяц крупной цифрой, столбики за семь дней, лента по дням. Композиция — из макета задачи 2.

- [ ] **Step 3: Проверить на настоящих величинах**

Экран обязан выглядеть правильно и на `25 000`, и на `54 124 654`. Это проверяется глазами
на телефоне, а не только в браузере.

- [ ] **Step 4: Учесть отсутствие пагинации**

`GET` возвращает всю историю. Пока история мала, это неважно; в ленте показывать разумный
срез (например, последние 50), считая сводку по всему массиву.

- [ ] **Step 5: Коммит**

---

## Задача 8: Экран добавления

**Files:**
- Create: `webapp-next/src/screens/Add.tsx`

**Одно текстовое поле.** Не форма с суммой, категорией и датой — это сознательное решение:
второй независимый путь создания транзакции означает вторую валидацию и второй набор полей,
а из-за таких вторых путей репозитории уже расходились.

- [ ] **Step 1: Отправка**

```
POST /api/voice/text-input
{ text, userId: <telegramId>, userName }
```

`userId` слать **явно**: дефолт в контроллере — `'1'`, и он пишет в общего теневого пользователя.

- [ ] **Step 2: Учесть частичный успех**

Ответ 200 не означает, что транзакция создана: упавшая при создании молча не попадает в массив.
Считать созданным только то, что пришло в `data.transactions`. Пустой массив — показать,
что не удалось разобрать, и оставить текст в поле.

- [ ] **Step 3: Учесть долги в ответе**

Ответ может содержать `debts`. Долг создаётся реально, но прочитать его нечем — `/debts` заморожен.
Показать нейтральное сообщение, что запись сохранена как долг, и не пытаться её отобразить.

- [ ] **Step 4: Обновление списка**

После успеха инвалидировать запрос списка. Не полагаться на ответ как на источник строки:
`POST /transactions` возвращал эхо запроса, а здесь возвращается разобранное, но без части полей.

- [ ] **Step 5: Коммит**

---

## Задача 9: Экран правки

**Files:**
- Create: `webapp-next/src/screens/Edit.tsx`

- [ ] **Step 1: Запрос**

```
PUT /api/transactions/:id
```

Белый список полей: `amount`, `category`, `description`, `date`, `type`, `semanticType`,
`needsReview`, `merchant`. Неизвестные молча отбрасываются, нужно хотя бы одно.

Валидация сервера: `amount > 0`, непустая `category`, `date` строго `YYYY-MM-DD`.

- [ ] **Step 2: Не давать править merchant**

`UpdateTransactionUseCase` деструктурирует фиксированный набор полей без `merchant`, поэтому
поле молча теряется: ответ 200, значение старое. Либо чинить use case, либо не показывать
это поле в UI. **По умолчанию — не показывать**: чинить чужой use case внутри задачи по фронтенду
значит смешивать два изменения в одном коммите.

Если решишь чинить — это одна строка в `updateTransaction.ts`, отдельной задачей и с тестом.

- [ ] **Step 3: Порядок операций**

Правка доступна только после того, как загрузился список: `verifyResourceOwnership` использует
`GetUserUseCase`, который не создаёт пользователя, и вернёт 403, если его ещё нет в БД.

- [ ] **Step 4: Коммит**

---

## Задача 10: Ошибки, которые пользователь увидит

**Files:**
- Modify: `webapp-next/src/api/client.ts`, экраны

Два кода ошибок обязаны иметь человеческий текст — они будут встречаться регулярно, а не в теории.

- [ ] **Step 1: Протухший initData → 401 INVALID_AUTH**

`initData` живёт **час**, Telegram обновляет его только при перезапуске мини-аппа. Сессия дольше
часа — и первое же действие даёт 401. Текст: «Сессия истекла, закройте и откройте приложение заново».
Не generic-ошибка.

- [ ] **Step 2: Лимит распознаваний → 429 AI_RATE_LIMIT_EXCEEDED**

Лимит **20 запросов на 15 минут, ключ — IP, а не пользователь**. За мобильным оператором с CGNAT
квоту делят все. Текст должен объяснять, что это временно.

- [ ] **Step 3: Тесты**

Оба случая проверяются на замоканном ответе: код доступен вызывающему и превращается
в понятный текст.

- [ ] **Step 4: Коммит**

---

## Задача 11: Помечать записи из мини-аппа

**Files:**
- Modify: `src/modules/voiceProcessing/presentation/controllers/voiceProcessingController.ts:124`
- Test: `tests/captureSourceFromApi.test.ts` (создать)

**Суть.** В фазе 1 добавлено поле `source`, но контроллер вызывает
`textUseCase.execute(text, userId, userName)` без четвёртого аргумента, поэтому `source`
всегда `'telegram'`. Записи из мини-аппа неотличимы от ботовых — то есть поле не выполняет
то, ради чего заведено.

- [ ] **Step 1: Написать падающий тест**

Тело запроса содержит `source: 'webapp'` → use case получает четвёртым аргументом `'webapp'`.
Отсутствие поля → `'telegram'`. Неизвестное значение → отвергается валидацией, а не пишется в базу.

- [ ] **Step 2: Реализовать**

Принять `source` из тела, проверить по списку допустимых, передать в use case.

- [ ] **Step 3: Слать из мини-аппа**

В `Add.tsx` добавить `source: 'webapp'` в тело запроса.

- [ ] **Step 4: Коммит**

---

## Задача 12: Переключение и проверка на телефоне

- [ ] **Step 1: Собрать и запустить**

Run: `cd webapp-next && npm run build && cd .. && npm run dev:miniapp -- --chat-id=<твой chat id>`

- [ ] **Step 2: Пройти сценарий целиком**

Записать трату голосом через бота → открыть мини-апп → убедиться, что она в ленте →
проверить, что сумма за месяц совпадает с той, что показал бот в карточке →
добавить трату из мини-аппа → поправить категорию → удалить.

**Совпадение сумм с ботом — главная проверка фазы.** Разошлись — значит правило расхода
из задачи 6 применено неверно.

- [ ] **Step 3: Проверить обе темы и обе крайности сумм**

- [ ] **Step 4: Переключить сборку**

Заменить `build:webapp` в корневом `package.json` на новый проект. Старый `webapp/` удалить
отдельным коммитом — он остаётся в git и восстанавливается.

- [ ] **Step 5: Полная проверка**

Run: `npm run verify`

- [ ] **Step 6: Обновить документацию**

`CLAUDE.md` (секция Design System и структура webapp), `docs/knowledge-base/10-design-guidelines/design-system.md`
(описывает 37 примитивов, которых больше нет), `docs/VISION.md`.

---

## Риски

**Расхождение с ботом в цифрах.** Главный. Смягчение — задача 6 целиком: одна функция,
таблица из восьми типов, проверка мутацией, и явная сверка на телефоне в задаче 12.

**Часовые пояса.** Календарный день системы — UTC. Клиент, считающий по локали браузера,
покажет неверный столбик за сегодня для записей, сделанных ночью. Смягчение — строковые
сравнения дат, никаких `new Date(...).getDate()`.

**Отсутствие пагинации.** История растёт линейно и вся приезжает одним массивом. Сейчас
это 29 записей. Когда станет тысячи — пробросить `limit` в `GetUserTransactionsUseCase`,
репозиторный `findByUserId(userId, limit?)` его уже поддерживает.

**Лимит 20 AI-запросов на IP за 15 минут.** При нескольких пользователях за одним NAT
это потолок, а не запас. Отдельного решения в этой фазе нет — только понятный текст ошибки.

**Обход проверки владения через UUID в пути.** Смягчение на стороне клиента — всегда слать
telegramId. Но защиту это не чинит: её надо будет пересматривать до хостинга, отдельной задачей.

---

## Чего в этой фазе нет

Apple Shortcuts, хостинг, размораживание бюджетов, долгов и аналитики, починка `merchant`
в `UpdateTransactionUseCase`, пагинация, пересмотр `verifyOwnership`.
