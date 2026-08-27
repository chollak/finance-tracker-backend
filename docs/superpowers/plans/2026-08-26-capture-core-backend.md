# Ядро захвата: бэкенд — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сжать бэкенд до ядра захвата: спрятать замороженные фичи за маршрутами, убрать деградацию времени ответа бота, начать копить данные о правках.

**Architecture:** Ядро захвата уже существует (`ProcessTextInputUseCase` / `ProcessVoiceInputUseCase` + маршруты `/api/voice/*`), поэтому работа не в перестройке, а в трёх направлениях: заморозка поверхности (фаза 0), сокращение задержки ответа и починка корректности на пути захвата (фаза 1), и новая таблица `corrections` (фаза 3). Модули продолжают конструироваться — замораживается их поверхность, а не существование.

**Порядок фаз:** 0 выполнена, 1 переписана после замеров, 3 без изменений. Фаза 2 (новый мини-апп) живёт в отдельном плане, который пишется после того, как бэкенд встанет.

**Tech Stack:** TypeScript, Express, Telegraf, TypeORM (SQLite), Supabase, Jest + ts-jest.

**Спека:** [2026-08-26-capture-core-design.md](../specs/2026-08-26-capture-core-design.md)

**Не входит:** новый мини-апп (фаза 2 — отдельный план), Apple Shortcuts, хостинг, обучение на исправлениях.

---

## Структура файлов

| Файл | Ответственность | Действие |
|---|---|---|
| `src/frozen.ts` | Единственный список замороженного с датой и причиной | создать |
| `src/delivery/web/express/expressServer.ts` | Регистрация маршрутов | изменить |
| `src/delivery/messaging/telegram/handlers/messageHandlers.ts` | Тонкий хендлер бота | изменить |
| `src/modules/transaction/domain/transactionEntity.ts` | Поле `source` | изменить |
| `src/modules/transaction/domain/correctionsRepository.ts` | Интерфейс лога правок | создать |
| `src/modules/transaction/infrastructure/persistence/SqliteCorrectionsRepository.ts` | Реализация для SQLite | создать |
| `src/modules/transaction/infrastructure/persistence/SupabaseCorrectionsRepository.ts` | Реализация для Supabase | создать |
| `src/modules/transaction/application/updateTransaction.ts` | Запись правок в лог | изменить |
| `migrations/009_corrections.sql` | Таблица в Supabase | создать |
| `scripts/measure-capture-latency.ts` | Замер базовой задержки | создано |
| `src/modules/voiceProcessing/infrastructure/openAITranscriptionService.ts` | Таймаут клиента OpenAI | изменить |
| `src/delivery/messaging/telegram/telegramBot.ts` | Резолв пользователя в контекст | изменить |
| `src/delivery/messaging/telegram/types/index.ts` | Поле `userUuid` в контексте | изменить |
| `scripts/normalize-transaction-dates.ts` | Нормализация уже сохранённых дат | создать |

---

## Фаза 0 — Заморозка — ВЫПОЛНЕНА 2026-08-26

Коммиты: `e4873b0` (маршруты), `93afefb` (учёт лимитов), `49cd884` (команды бота).
Проверено: сборка чистая, 38 сюит / 331 тест зелёные, dependency-cruiser без нарушений,
циклов нет, сервер поднимается, замороженные маршруты отвечают 404,
`POST /api/voice/text-input` — 401, база не изменилась.

**Отклонения от того, что написано в задачах ниже:**

1. **Задачи 2 и 3 слиты.** `noUnusedLocals` и `noUnusedParameters` включены, поэтому
   снять регистрацию маршрутов, не сузив сигнатуру `buildServer` в том же коммите,
   невозможно — промежуточное состояние не компилируется.
2. **Добавлена заморозка учёта лимитов, которой в плане не было.** Она вскрыла баг,
   портивший данные: `createTransaction.ts:76` и `deleteTransaction.ts:75` звали
   `getOrCreateUser({ telegramId: userId })` с уже разрезолвленным UUID, из-за чего
   создавались теневые пользователи. Подробности и условия разморозки — в `src/frozen.ts`.
   Проверку лимитов пришлось снять вместе с инкрементом: иначе счётчик замирал на 71
   против лимита 50 и блокировал реального пользователя без возможности купить премиум.
3. **Заморозка сделана проводкой, а не удалением.** Все потребители объявляют
   `subscriptionModule` необязательным и имеют ветку без него, поэтому достаточно
   перестать его передавать в трёх местах композиционных корней.
4. **Текст приветствия переписан** — он перечислял ровно те команды, которые снимались.
5. **Список заморозки сделан исполняемым:** `register()` в `expressServer.ts` падает,
   если вернуть маршрут, не убрав путь из `FROZEN_ROUTES`. Заодно ушло предупреждение
   dependency-cruiser о модуле-сироте.
6. **Замороженные обработчики команд экспортированы**, чтобы тесты продолжали их
   покрывать напрямую, минуя снятую регистрацию.

### Task 1: Список замороженного

**Files:**
- Create: `src/frozen.ts`

- [ ] **Step 1: Создать файл со списком**

```typescript
/**
 * Список замороженной функциональности.
 *
 * Заморожено 2026-08-26 по спеке docs/superpowers/specs/2026-08-26-capture-core-design.md
 *
 * «Заморожено» означает: код остаётся на месте и продолжает собираться и
 * тестироваться, но его маршруты не регистрируются и в интерфейсе он не появляется.
 * Модули продолжают конструироваться в appModules.ts — от них зависят живые части
 * (например, VoiceProcessingModule принимает DebtModule, и без него фразы про долги
 * молча перестали бы что-либо создавать).
 *
 * Чтобы разморозить: убрать строку отсюда и вернуть регистрацию в expressServer.ts.
 */
export const FROZEN_ROUTES = [
  '/budgets',
  '/debts',
  '/dashboard',
  '/openai',
  '/subscription',
] as const;

export type FrozenRoute = (typeof FROZEN_ROUTES)[number];

export function isRouteFrozen(path: string): boolean {
  return (FROZEN_ROUTES as readonly string[]).includes(path);
}
```

- [ ] **Step 2: Убедиться, что проект собирается**

Run: `npm run build`
Expected: успешная компиляция, без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add src/frozen.ts
git commit -m "chore: завести единый список замороженной функциональности"
```

---

### Task 2: Заморозить маршруты

**Files:**
- Modify: `src/delivery/web/express/expressServer.ts`
- Test: `tests/frozenRoutes.test.ts` (создать)

- [ ] **Step 1: Написать падающий тест**

Тест собирает роутер тем же способом, что `apiRoutes.test.ts` (вручную, без `buildServer` — он требует полной сборки модулей), и проверяет, что замороженные пути отвечают 404.

```typescript
// tests/frozenRoutes.test.ts
import { FROZEN_ROUTES, isRouteFrozen } from '../src/frozen';

describe('замороженные маршруты', () => {
  it('перечисляет ровно те пути, которые спрятаны от пользователя', () => {
    expect([...FROZEN_ROUTES]).toEqual([
      '/budgets',
      '/debts',
      '/dashboard',
      '/openai',
      '/subscription',
    ]);
  });

  it('не считает замороженным живой маршрут захвата', () => {
    expect(isRouteFrozen('/voice')).toBe(false);
    expect(isRouteFrozen('/transactions')).toBe(false);
    expect(isRouteFrozen('/users')).toBe(false);
  });

  it('считает замороженным каждый путь из списка', () => {
    for (const route of FROZEN_ROUTES) {
      expect(isRouteFrozen(route)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Запустить тест — должен пройти сразу**

Run: `npx jest tests/frozenRoutes.test.ts`
Expected: PASS (список из Task 1 уже верен).

Примечание: этот тест охраняет список, а не поведение Express. Поведение проверяется вручную в шаге 5 — поднимать полноценный `buildServer` в тесте не окупается, о чём прямо написано в комментарии к `apiRoutes.test.ts`.

- [ ] **Step 3: Убрать регистрацию замороженных маршрутов**

В `src/delivery/web/express/expressServer.ts` удалить блоки `router.use('/budgets', ...)`, `router.use('/debts', ...)`, `router.use('/dashboard', ...)`, `router.use('/openai', ...)` и блок `if (subscriptionModule && userModule) { router.use('/subscription', ...) }`.

Над оставшимися маршрутами поставить ссылку на список:

```typescript
// Маршруты из FROZEN_ROUTES (src/frozen.ts) намеренно не регистрируются.
// Модули при этом продолжают конструироваться в appModules.ts — от них зависят живые части.
```

Неиспользованные импорты (`createBudgetRouter`, `createDebtRouter`, `createDashboardRouter`, `createSubscriptionRoutes`) удалить, иначе сборка упадёт на `noUnusedLocals`, если он включён. Параметры `budgetModule`, `debtModule`, `openAIUsageModule` в сигнатуре `buildServer` оставить — их убирает Task 3.

- [ ] **Step 4: Прогнать всю линейку**

Run: `npm run build && npm run test:ci`
Expected: сборка проходит, все тесты зелёные. Если упал тест — значит он полагался на замороженный маршрут; зафиксировать какой и остановиться, это сигнал, что заморозка задевает живое.

- [ ] **Step 5: Проверить руками**

Run: `npm run dev`
Затем в другом терминале:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/budgets/x
```

Expected: `200` для health, `404` для budgets.

- [ ] **Step 6: Коммит**

```bash
git add src/delivery/web/express/expressServer.ts tests/frozenRoutes.test.ts
git commit -m "refactor(api): спрятать маршруты замороженных модулей"
```

---

### Task 3: Убрать замороженные модули из сигнатуры сервера

**Files:**
- Modify: `src/delivery/web/express/expressServer.ts`
- Modify: `src/index.ts` (или тот файл, что вызывает `buildServer` — найти командой ниже)

- [ ] **Step 1: Найти вызовы buildServer**

Run: `grep -rn "buildServer" src/`
Записать все места вызова.

- [ ] **Step 2: Сузить сигнатуру**

Убрать из параметров `buildServer` всё, что больше не используется внутри: `budgetModule`, `debtModule`, `openAIUsageModule`. Оставить `transactionModule`, `voiceModule`, `userModule`, `subscriptionModule` (последний ещё нужен транзакционному роутеру).

- [ ] **Step 3: Обновить вызовы**

Привести найденные в шаге 1 вызовы к новой сигнатуре.

- [ ] **Step 4: Прогнать линейку**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "refactor(api): убрать замороженные модули из сигнатуры buildServer"
```

---

### Task 4: Заморозить команды бота

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/commandHandlers.ts`
- Modify: `src/delivery/messaging/telegram/telegramBot.ts`

- [ ] **Step 1: Прочитать текущий набор команд**

Run: `grep -n "command(" src/delivery/messaging/telegram/telegramBot.ts`
Выписать список зарегистрированных команд.

- [ ] **Step 2: Оставить только /start**

Снять регистрацию всех команд кроме `/start`. Сами обработчики в `commandHandlers.ts` **не удалять** — они замораживаются, а не выпиливаются. Над снятыми регистрациями оставить комментарий со ссылкой на `src/frozen.ts`.

Отдельно проследить за `quickCategoryKeyboard` (`commandHandlers.ts:92` и `:313`) — он используется только в замораживаемых командах и после этого шага станет недостижим из бота. Файл клавиатуры оставить на месте.

- [ ] **Step 3: Прогнать тесты бота**

Run: `npx jest tests/telegramBot.test.ts tests/telegramMessageHandlers.test.ts tests/telegramWeeklyCommand.test.ts`
Expected: тесты замороженных команд упадут — это ожидаемо. Обновить их так, чтобы они проверяли **отсутствие** регистрации, а не поведение. Тесты самих обработчиков не трогать.

- [ ] **Step 4: Полная линейка**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "refactor(telegram): оставить в боте только /start и захват"
```

---

## Фаза 1 — Задержка ответа — ВЫПОЛНЕНА 2026-08-27

Коммиты: `c038c07` (формат даты), `b36cbcb` (таймаут OpenAI), `8a5110e` (дубль резолва),
`a4c2bfd` (индикатор), `734ee54` (счётчик быстрого пути), `19206b4` (снято подтверждение),
`af8ec6a` (поле source), `abae93b` (сводка за месяц).

Проверено: сборка чистая, 47 сюит / 378 тестов зелёные, dependency-cruiser без нарушений,
циклов нет. Каждая правка поведения проверена мутацией.

**Отклонения и находки:**

1. **Задача 6 доросла до применения.** Битая строка в `data/database.sqlite`
   нормализована скриптом; перед записью снята копия, диф подтвердил, что изменилась
   только дата.
2. **Задача 7 доросла до текста ошибки.** Цепочка до пользователя работала, но в чат
   уходило `External service error: OpenAI Transcription`. Добавлен `userFacingMessage`;
   заодно закрыта утечка — раньше наружу мог уйти `ECONNREFUSED` с адресом базы.
3. **Задача 10 расширена причиной.** Логируется не только доля ухода в OpenAI, но и какой
   гард его вызвал. Первая версия метки врала: `parseAmount('5000')` возвращает `null`
   не из-за отсутствия суммы, а из-за отсутствия описания.
4. **Задача 12 несёт отложенный риск.** `migrations/009` обязана быть применена до
   возврата Supabase из паузы, иначе вставки упадут. Там же выяснилось, что репозиторий
   уже пишет `semantic_type` и `needs_review` из миграций 007 и 008, которые, по записям
   проекта, не применены — то есть вставки в Supabase могут быть сломаны уже сейчас.
5. **Задача 13 поймана существующим тестом.** `telegramMessageHandlers` мокал
   `getGetUserTransactionsUseCase`, которого сводка больше не использует.

**Осталось нерешённым:** сужение стоп-слов. Данные для решения теперь собираются
(задача 10), возвращаться через неделю реального пользования.

### Как было переписано

**Почему переписана.** Исходная задача фазы — «убрать полную выборку истории из
критического пути» — не подтвердилась замером. При тысяче транзакций полная выборка
стоит 11 мс, при шести тысячах — 72 мс. На фоне вызова к OpenAI (секунды) это шум.
Замер: коммит `e2df093`.

Разбор критического пути тремя агентами дал другую картину. `DATABASE_TYPE=supabase`,
то есть каждое обращение к базе — сетевой round-trip, а не диск. До первого ответа их
набиралось около двенадцати, часть — дубли. Плюс основной вклад даёт вызов OpenAI,
причём туда уходит **естественная речь**: быстрый путь в `processTextInput.ts` глушат
стоп-слова `за`, `по`, `и`, `купил`, `взял`, а `COMPLEX_TEXT_MARKERS_PATTERN = /[.!?;]/`
реагирует на любую пунктуацию — поэтому транскрипты Whisper не попадают в него никогда.

Эмпирика на корпусе бытовых фраз: «продукты 200 тысяч» → быстрый путь,
«купил продукты на 200 тысяч» → сеть.

Порядок задач ниже — по убыванию отдачи, но корректность идёт первой.

---

### Task 6: Единый формат даты

**Files:**
- Modify: `src/modules/transaction/application/createTransaction.ts`
- Modify: `src/modules/transaction/domain/transactionEntity.ts`
- Create: `scripts/normalize-transaction-dates.ts`
- Test: `tests/transactionDateNormalization.test.ts` (создать)

**Суть.** В колонку `date` пишутся два формата. `processTextInput.ts:144` кладёт
`YYYY-MM-DD`, быстрое добавление `messageHandlers.ts:421` — полный ISO через
`new Date().toISOString()`. Сравнение в SQL строковое, поэтому
`'2026-08-26T12:00:00.000Z' <= '2026-08-26'` даёт ложь, и запись выпадает из любой
выборки по диапазону дат.

Баг уже сработал: в `data/database.sqlite` **одна строка из 29** хранит
`2026-01-21T04:20:47.000Z`.

Чинить нужно **до** Task 13, иначе перевод сводки на диапазон дат молча потеряет записи.

Нормализация ставится в `CreateTransactionUseCase` — это единственная точка, через
которую проходят все создания, и там уже нормализуются два других поля
(`normalizeSemanticType`, `normalizeNeedsReview`). Это прямое применение принципа
«Normalization at Input» из `CLAUDE.md`.

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/transactionDateNormalization.test.ts
import { normalizeTransactionDate } from '../src/modules/transaction/domain/transactionEntity';

describe('normalizeTransactionDate', () => {
  it('обрезает полный ISO до календарного дня', () => {
    expect(normalizeTransactionDate('2026-01-21T04:20:47.000Z')).toBe('2026-01-21');
  });

  it('оставляет уже нормальную дату как есть', () => {
    expect(normalizeTransactionDate('2026-08-26')).toBe('2026-08-26');
  });

  it('принимает Date', () => {
    expect(normalizeTransactionDate(new Date('2026-08-26T23:30:00.000Z'))).toBe('2026-08-26');
  });

  it('на мусоре возвращает сегодняшний день, а не невалидную строку', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(normalizeTransactionDate('не дата')).toBe(today);
    expect(normalizeTransactionDate('')).toBe(today);
    expect(normalizeTransactionDate(undefined)).toBe(today);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/transactionDateNormalization.test.ts`
Expected: FAIL — `normalizeTransactionDate` не существует.

- [ ] **Step 3: Написать нормализатор**

В `src/modules/transaction/domain/transactionEntity.ts`, рядом с `normalizeNeedsReview`:

```typescript
/**
 * Приводит дату транзакции к календарному дню YYYY-MM-DD.
 *
 * Колонка date сравнивается в SQL как строка, поэтому полный ISO
 * ('2026-08-26T12:00:00.000Z') не проходит условие date <= '2026-08-26'
 * и запись выпадает из любой выборки по диапазону.
 */
export function normalizeTransactionDate(value?: string | Date): string {
    const today = (): string => new Date().toISOString().split('T')[0];

    if (!value) return today();

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? today() : value.toISOString().split('T')[0];
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().split('T')[0];
}
```

- [ ] **Step 4: Применить в единственной точке входа**

В `CreateTransactionUseCase.execute`, рядом с уже существующими нормализациями
(`createTransaction.ts:51-52`):

```typescript
    transaction.semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);
    transaction.needsReview = normalizeNeedsReview(transaction.needsReview);
    transaction.date = normalizeTransactionDate(transaction.date);
```

Быстрое добавление в `messageHandlers.ts:421` при этом можно не трогать — нормализация
поймает его на входе. Но комментарий там оставить, чтобы следующий читатель не удивился.

- [ ] **Step 5: Запустить тесты**

Run: `npx jest tests/transactionDateNormalization.test.ts tests/createTransaction.test.ts`
Expected: PASS.

- [ ] **Step 6: Написать скрипт нормализации существующих строк**

```typescript
// scripts/normalize-transaction-dates.ts
/**
 * Приводит уже сохранённые даты к YYYY-MM-DD.
 * По умолчанию только показывает, что собирается изменить.
 * Применение: npx ts-node scripts/normalize-transaction-dates.ts --apply
 */
import { RepositoryFactory } from '../src/shared/infrastructure/database/repositoryFactory';
import { normalizeTransactionDate } from '../src/modules/transaction/domain/transactionEntity';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const repo = RepositoryFactory.createTransactionRepository();
  const all = await repo.getAll();

  const broken = all.filter((tx) => tx.date !== normalizeTransactionDate(tx.date));

  console.log(`Всего транзакций: ${all.length}, требуют нормализации: ${broken.length}`);
  for (const tx of broken) {
    console.log(`  ${tx.id}: ${tx.date} → ${normalizeTransactionDate(tx.date)}`);
  }

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Для применения запустить с флагом --apply');
    return;
  }

  for (const tx of broken) {
    await repo.update(tx.id!, { date: normalizeTransactionDate(tx.date) });
  }
  console.log(`\nОбновлено строк: ${broken.length}`);
}

main().catch((error) => {
  console.error('Нормализация не удалась:', error);
  process.exit(1);
});
```

- [ ] **Step 7: Посмотреть предпросмотр и остановиться**

Run: `npx ts-node scripts/normalize-transaction-dates.ts`
Expected: перечислены строки-кандидаты. **Не применять без отдельного решения** —
на Supabase объём неизвестен, база на паузе.

- [ ] **Step 8: Полная линейка и коммит**

Run: `npm run build && npm run test:ci`

```bash
git add -A
git commit -m "fix(transaction): привести дату к календарному дню на входе"
```

---

### Task 7: Таймаут и ретраи OpenAI

**Files:**
- Modify: `src/modules/voiceProcessing/infrastructure/openAITranscriptionService.ts:28`
- Test: `tests/openAIClientLimits.test.ts` (создать)

**Суть.** Клиент создаётся как `new OpenAI({ apiKey: key })`. Дефолты SDK —
`timeout: 600000` (десять минут) и `maxRetries: 2`. В патологии бот молчит до получаса,
и пользователь не получает даже сообщения об ошибке. Это не хвост распределения,
а отсутствие потолка.

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/openAIClientLimits.test.ts
const constructorCalls: unknown[] = [];

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class {
      constructor(options: unknown) {
        constructorCalls.push(options);
      }
      audio = { transcriptions: { create: jest.fn() } };
      chat = { completions: { create: jest.fn() } };
    },
  };
});

import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';

describe('клиент OpenAI', () => {
  beforeEach(() => {
    constructorCalls.length = 0;
  });

  it('задаёт потолок ожидания вместо десятиминутного дефолта SDK', () => {
    new OpenAITranscriptionService('test-key');

    expect(constructorCalls).toHaveLength(1);
    const options = constructorCalls[0] as { timeout?: number; maxRetries?: number };
    expect(options.timeout).toBeLessThanOrEqual(30_000);
    expect(options.maxRetries).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/openAIClientLimits.test.ts`
Expected: FAIL — `timeout` и `maxRetries` не переданы.

- [ ] **Step 3: Задать пределы**

```typescript
    // Дефолты SDK — timeout 600000 мс и 2 ретрая, то есть до получаса молчания.
    // Пользователь, ждущий ответа на «такси 18 тысяч», столько не ждёт.
    this.openai = new OpenAI({
      apiKey: key,
      timeout: 25_000,
      maxRetries: 1,
    });
```

- [ ] **Step 4: Проверить, что превышение даёт понятный ответ**

Найти, как обрабатывается ошибка транскрипции/разбора выше по стеку, и убедиться,
что пользователь получает текст, а не молчание. Если такой ветки нет — добавить
в `messageHandlers.ts` понятное сообщение об истёкшем ожидании.

- [ ] **Step 5: Тесты и коммит**

Run: `npm run build && npm run test:ci`

```bash
git add -A
git commit -m "fix(openai): ограничить ожидание ответа 25 секундами"
```

---

### Task 8: Убрать выброшенный запрос пользователя

**Files:**
- Modify: `src/delivery/messaging/telegram/telegramBot.ts:103-118`
- Modify: `src/delivery/messaging/telegram/types/index.ts`
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:141,221`
- Test: `tests/telegramUserResolution.test.ts` (создать)

**Суть.** Глобальный middleware `telegramBot.ts:106` делает `getOrCreateUser`
и **выбрасывает результат** — он никуда не присваивается. Затем обработчик
(`messageHandlers.ts:141` для текста, `:221` для голоса) резолвит того же пользователя
заново через `resolveUserIdToUUID`.

На Supabase каждый `getOrCreate` — это два round-trip (`findByTelegramId` + `updateLastSeen`).
То есть на каждое сообщение уходит два лишних обращения к сети впустую.

Примечание: разбор насчитал больше дублей, но два из них жили в
`subscriptionMiddleware.ts:33` и `createTransaction.ts:76` — оба уже отключены
заморозкой (коммит `93afefb`).

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/telegramUserResolution.test.ts
import { resolveUserIdForContext } from '../src/delivery/messaging/telegram/handlers/messageHandlers';

describe('резолв пользователя в обработчике', () => {
  it('переиспользует uuid, положенный middleware, не ходя в базу', async () => {
    const execute = jest.fn();
    const userModule = { getGetOrCreateUserUseCase: () => ({ execute }) };
    const ctx = { from: { id: 131184740 }, userUuid: 'uuid-из-middleware' };

    const userId = await resolveUserIdForContext(ctx as never, userModule as never);

    expect(userId).toBe('uuid-из-middleware');
    expect(execute).not.toHaveBeenCalled();
  });

  it('падает обратно на резолв, если middleware ничего не положил', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'uuid-из-базы' });
    const userModule = { getGetOrCreateUserUseCase: () => ({ execute }) };
    const ctx = { from: { id: 131184740 } };

    const userId = await resolveUserIdForContext(ctx as never, userModule as never);

    expect(userId).toBe('uuid-из-базы');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/telegramUserResolution.test.ts`
Expected: FAIL — функции нет.

- [ ] **Step 3: Сохранить результат middleware в контекст**

Расширить `BotContext` полем `userUuid?: string` в `src/delivery/messaging/telegram/types/index.ts`,
и в `telegramBot.ts` присвоить результат вместо выбрасывания:

```typescript
        try {
          // Результат кладём в контекст: обработчики ниже используют его вместо
          // повторного резолва. На Supabase каждый getOrCreate — два round-trip.
          const user = await userModule.getGetOrCreateUserUseCase().execute({ ... });
          ctx.userUuid = user.id;
        } catch (error) {
```

- [ ] **Step 4: Переиспользовать в обработчиках**

```typescript
export async function resolveUserIdForContext(
  ctx: BotContext,
  userModule: UserModule
): Promise<string> {
  if (ctx.userUuid) return ctx.userUuid;
  return resolveUserIdToUUID(String(ctx.from?.id), userModule);
}
```

Заменить вызовы в `messageHandlers.ts:141` и `:221` на эту функцию.

- [ ] **Step 5: Тесты, сборка, коммит**

Run: `npm run build && npm run test:ci`

```bash
git add -A
git commit -m "perf(telegram): не резолвить пользователя дважды за сообщение"
```

---

### Task 9: Показать индикатор раньше

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:150,162`

**Суть.** `sendChatAction('typing')` вызывается после резолва пользователя и прочей
подготовки. Пауза «бот меня вообще услышал?» равна не общей задержке, а первым сотням
миллисекунд, в которые не происходит ничего видимого. Перенос индикатора в самое начало
обработчика не меняет общее время, но заметно меняет ощущаемое.

- [ ] **Step 1: Перенести вызов**

Поставить `await sendProcessingFeedback(ctx)` первой строкой тела обработчиков текста
и голоса, до резолва пользователя и до любых обращений к базе.

- [ ] **Step 2: Проверить руками**

Run: `npm run dev`, отправить боту фразу со сложной формулировкой
(например «купил продукты на 200 тысяч», она уходит в OpenAI).
Expected: индикатор «печатает» появляется практически мгновенно.

- [ ] **Step 3: Тесты и коммит**

Run: `npm run test:ci`

```bash
git add -A
git commit -m "fix(telegram): показывать индикатор до обращений к базе"
```

---

### Task 10: Счётчик быстрого пути

**Files:**
- Modify: `src/modules/voiceProcessing/application/processTextInput.ts`
- Test: `tests/processTextInput.test.ts`

**Суть.** Сужение стоп-слов — самая большая отдача по задержке и самый большой риск:
`за`, `по`, `и`, `купил`, `взял` стоят там против составных фраз («купил X и Y» может быть
несколькими транзакциями). Решать это вслепую нельзя — в репозитории нет ни одного
реального лога употребления, а корпус из тринадцати фраз доказательством не является.

Поэтому фаза 1 **не трогает стоп-слова**, а ставит счётчик и оставляет решение на потом.

- [ ] **Step 1: Написать падающий тест**

```typescript
it('сообщает, каким путём разобрана фраза', async () => {
  const logs: Array<{ path: string }> = [];
  // Подменить логгер категории OPENAI и собрать записи; форму подогнать
  // под то, как устроены существующие тесты в этом файле.
  // «такси 15000» → fast, «купил продукты на 200 тысяч» → openai
});
```

Форму теста подогнать под уже существующий `tests/processTextInput.test.ts` —
сначала прочитать его целиком.

- [ ] **Step 2: Добавить одну строку лога**

В `ProcessTextInputUseCase.execute`, сразу после выбора ветки разбора:

```typescript
    const parsedFast = parseObviousSemanticTransaction(text) || parseSimpleTextTransaction(text);
    const parsed = parsedFast || await this.openAIService.analyzeInput(text);

    // Сырьё для будущего решения о сужении стоп-слов. Ничего не решает сам по себе.
    logger.info('Разбор текста', { path: parsedFast ? 'fast' : 'openai' });
```

- [ ] **Step 3: Тесты и коммит**

Run: `npm run build && npm run test:ci`

```bash
git add -A
git commit -m "chore(voice): считать, как часто разбор уходит в OpenAI"
```

- [ ] **Step 4: Записать, когда вернуться**

Через неделю реального пользования посчитать доли:
`grep 'Разбор текста' <лог> | grep -c 'openai'` против `'fast'`.
Если в сеть уходит больше половины — сужать стоп-слова, начиная с
`COMPLEX_TEXT_MARKERS_PATTERN`, который сейчас режет любую пунктуацию и один этот факт
делает быстрый путь недостижимым для транскриптов Whisper.

---

### Task 11: Снять ветку подтверждения

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:310-335`
- Test: `tests/telegramMessageHandlers.test.ts`

**Суть.** При `confidence < 0.6` показывается `transactionConfirmationKeyboard` вместо
`transactionAutoSavedKeyboard`. Транзакция в обоих случаях уже сохранена, поэтому
подтверждение — лишнее действие. Низкая уверенность остаётся видимой в тексте карточки.

- [ ] **Step 1: Написать падающий тест**

Проверить, что при `confidence: 0.2` и при `confidence: 0.95` возвращается одинаковая
клавиатура. Форму подогнать под существующий файл теста — прочитать его целиком.

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/telegramMessageHandlers.test.ts`

- [ ] **Step 3: Убрать выбор**

```typescript
// Подтверждение снято намеренно: лишний шаг в каждом случае ради ошибок в меньшинстве.
// Низкая уверенность остаётся видимой в тексте карточки (formatTransactionMessage).
const keyboard = transactionAutoSavedKeyboard(tx.id, userId);
```

`CONFIDENCE_THRESHOLD` и `needsConfirmation` оставить — они управляют подсветкой.
Импорт `transactionConfirmationKeyboard` убрать, файл клавиатуры оставить.

- [ ] **Step 4: Проверить руками**

Отправить боту невнятную фразу и обычную — набор кнопок должен совпасть,
вторая должна быть помечена в тексте.

- [ ] **Step 5: Тесты и коммит**

```bash
git add -A
git commit -m "feat(telegram): убрать шаг подтверждения из захвата"
```

---

### Task 12: Поле source

**Files:**
- Modify: `src/modules/transaction/domain/transactionEntity.ts`
- Modify: `src/modules/voiceProcessing/application/processTextInput.ts`, `processVoiceInput.ts`
- Modify: обе реализации репозитория транзакций
- Test: `tests/transactionSource.test.ts` (создать)

**Суть.** Единственное действительно новое поле из спеки: `originalText`, `confidence`,
`originalParsing`, `needsReview`, `merchant` и `semanticType` в `Transaction` уже есть.
`source` нужен, чтобы отличать каналы захвата, когда появится Shortcut.

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/transactionSource.test.ts
it('проставляет канал захвата', async () => {
  const created: unknown[] = [];
  const createTransactionUseCase = {
    execute: jest.fn(async (tx: unknown) => { created.push(tx); return { success: true, data: 'tx-1' }; }),
  };
  const useCase = new ProcessTextInputUseCase(
    { analyzeInput: jest.fn() } as never,
    createTransactionUseCase as never
  );

  await useCase.execute('такси 18000', 'user-1', 'Тест', 'telegram');
  expect((created[0] as { source?: string }).source).toBe('telegram');
});

it('по умолчанию telegram', async () => { /* то же без четвёртого аргумента */ });
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/transactionSource.test.ts`

- [ ] **Step 3: Добавить тип и поле**

```typescript
export type TransactionSource = 'telegram' | 'shortcut' | 'webapp';
```

и в интерфейс `Transaction`:

```typescript
    /** Откуда пришла запись. Нужно, чтобы отличать каналы захвата при анализе. */
    source?: TransactionSource;
```

- [ ] **Step 4: Пробросить через use case**

Добавить необязательный параметр `source: TransactionSource = 'telegram'` в `execute`
обоих use case'ов и положить в собираемый объект.

- [ ] **Step 5: Сохранять в обеих базах**

Колонка в TypeORM-сущности плюс маппинг в обоих репозиториях. Свериться с тем, как
сделан `originalParsing` — там уже решена та же задача.

- [ ] **Step 6: Тесты и коммит**

Run: `npx jest tests/sqliteTransactionRepository.test.ts tests/supabaseTransactionRepository.test.ts tests/transactionSource.test.ts`

```bash
git add -A
git commit -m "feat(transaction): записывать канал захвата в поле source"
```

---

### Task 13: Сводка за месяц вместо всей истории

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:340-360`
- Test: `tests/todaySummaryScope.test.ts` (создать)

**Внимание: делать только после Task 6.** До нормализации дат перевод на диапазон
молча потеряет записи, сохранённые в формате полного ISO.

**Суть.** `getTodaySummary` вызывает `getGetUserTransactionsUseCase().execute(userId)` —
всю историю ради двух сумм за текущий месяц. Обе суммы укладываются в месяц, а в
репозитории уже есть `getByUserIdAndDateRange`, который фильтрует на стороне SQL.

Замер: 11 мс на тысяче записей, 72 мс на шести тысячах против стабильных 3 мс.
Это **гигиена, а не борьба с трением** — задача стоит последней в фазе именно поэтому.

Фильтрация по `needsReview` и `countsAsRealExpense` остаётся в JS: перенос в SQL
продублировал бы логику в двух репозиториях, а они на этом уже расходились
(коммит `f0ce281`).

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/todaySummaryScope.test.ts
import { getTodaySummaryForTest } from '../src/delivery/messaging/telegram/handlers/messageHandlers';

it('запрашивает только текущий месяц, а не всю историю', async () => {
  const getByUserIdAndDateRange = jest.fn().mockResolvedValue([]);
  const findByUserId = jest.fn().mockResolvedValue([]);
  const transactionModule = { getRepository: () => ({ getByUserIdAndDateRange, findByUserId }) };

  await getTodaySummaryForTest(transactionModule as never, 'user-1');

  expect(getByUserIdAndDateRange).toHaveBeenCalledTimes(1);
  expect(findByUserId).not.toHaveBeenCalled();

  const [userId, startDate] = getByUserIdAndDateRange.mock.calls[0];
  expect(userId).toBe('user-1');
  expect(startDate.getDate()).toBe(1);
});

it('считает обе суммы по одному ответу репозитория', async () => {
  // сегодняшняя запись 100, ранняя в этом месяце 50, и одна с needsReview: true
  // ожидание: todayTotal 100, monthTotal 150
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/todaySummaryScope.test.ts`

- [ ] **Step 3: Переписать getTodaySummary**

```typescript
async function getTodaySummary(
  transactionModule: BotContext['modules']['transactionModule'],
  userId: string
): Promise<{ todayTotal: number; monthTotal: number } | undefined> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Обе суммы укладываются в текущий месяц, поэтому истории целиком не нужно.
    const transactions = await transactionModule
      .getRepository()
      .getByUserIdAndDateRange(userId, startOfMonth, now);

    let todayTotal = 0;
    let monthTotal = 0;

    for (const tx of transactions) {
      const semanticType = normalizeSemanticType(tx.semanticType, tx.type);
      if (tx.needsReview || !countsAsRealExpense(semanticType)) continue;

      monthTotal += tx.amount;
      if (new Date(tx.date) >= startOfToday) todayTotal += tx.amount;
    }

    return { todayTotal, monthTotal };
  } catch {
    return undefined;
  }
}
```

Геттер `getRepository()` уже существует — `transactionModule.ts:83`.
Экспортировать тонкую обёртку `getTodaySummaryForTest` для теста.

- [ ] **Step 4: Перезамерить**

Run: `npx ts-node scripts/measure-capture-latency.ts`
Сравнить с базовой линией из коммита `e2df093`.

- [ ] **Step 5: Тесты и коммит**

```bash
git add -A
git commit -m "perf(telegram): считать сводку за месяц, а не по всей истории"
```

---

## Фаза 3 — Пассивный лог правок

### Task 14: Интерфейс и SQLite-реализация лога

**Files:**
- Create: `src/modules/transaction/domain/correctionsRepository.ts`
- Create: `src/modules/transaction/infrastructure/persistence/SqliteCorrectionsRepository.ts`
- Test: `tests/correctionsRepository.test.ts` (создать)

- [ ] **Step 1: Написать падающий тест**

**Важно:** `SqliteCorrectionsRepository`, как и `SqliteTransactionRepository`, берёт репозиторий
из `AppDataSource` в конструкторе, поэтому без базы тест не поднимется. Повторить приём из
`tests/sqliteTransactionRepository.test.ts:7-45`: `jest.mock('typeorm', ...)` с заглушками
декораторов плюс `jest.mock` на `database.config` с подставным репозиторием на `Map`.
Скопировать оттуда шапку целиком, заменив только форму строки.

```typescript
// tests/correctionsRepository.test.ts
// (шапка с jest.mock('typeorm') и jest.mock('database.config') — по образцу
//  tests/sqliteTransactionRepository.test.ts:7-45)
import { SqliteCorrectionsRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteCorrectionsRepository';

describe('SqliteCorrectionsRepository', () => {
  it('сохраняет по строке на каждое изменившееся поле', async () => {
    const repo = new SqliteCorrectionsRepository();

    await repo.record({
      userId: 'user-1',
      transactionId: 'tx-1',
      field: 'category',
      oldValue: 'other',
      newValue: 'restaurants',
      originalText: 'обед в evos 45000',
    });

    const rows = await repo.findByUserId('user-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('category');
    expect(rows[0].oldValue).toBe('other');
    expect(rows[0].newValue).toBe('restaurants');
    expect(rows[0].createdAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/correctionsRepository.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Написать интерфейс**

```typescript
// src/modules/transaction/domain/correctionsRepository.ts

/** Одна правка одного поля. Пассивный лог: ничего не читает продукт, только аналитика. */
export interface Correction {
  id?: string;
  userId: string;
  transactionId: string;
  /**
   * Только те поля, которые реально принимает UpdateTransactionRequest.
   * `merchant` сюда не входит: use case его не принимает и через правку он не меняется.
   * Добавлять в объединение только вместе с поддержкой в UpdateTransactionRequest.
   */
  field: 'amount' | 'category' | 'type' | 'description' | 'date';
  oldValue: string;
  newValue: string;
  /** Исходная фраза пользователя. Персональные данные — в логи не выводить. */
  originalText?: string;
  createdAt?: string;
}

export interface CorrectionsRepository {
  record(correction: Correction): Promise<void>;
  findByUserId(userId: string, limit?: number): Promise<Correction[]>;
}
```

- [ ] **Step 4: Реализовать для SQLite**

Повторить устройство `SqliteTransactionRepository`: TypeORM-сущность в `src/shared/infrastructure/database/entities/`, репозиторий рядом с транзакционным. В разработке действует `synchronize: true`, отдельная миграция для SQLite не нужна.

- [ ] **Step 5: Запустить тест**

Run: `npx jest tests/correctionsRepository.test.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat(transaction): завести пассивный лог правок"
```

---

### Task 15: Писать в лог при правке транзакции

**Files:**
- Modify: `src/modules/transaction/application/updateTransaction.ts`
- Test: `tests/updateTransaction.test.ts`

- [ ] **Step 1: Написать падающий тест**

```typescript
it('пишет строку в лог на каждое изменившееся поле', async () => {
  const record = jest.fn();
  const repository = {
    findById: jest.fn().mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      amount: 45000,
      category: 'other',
      type: 'expense',
      originalText: 'обед в evos 45000',
    }),
    update: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  };

  const useCase = new UpdateTransactionUseCase(repository as never, { record } as never);
  await useCase.execute({ id: 'tx-1', category: 'restaurants', amount: 46000 });

  expect(record).toHaveBeenCalledTimes(2);
  const fields = record.mock.calls.map((c) => c[0].field).sort();
  expect(fields).toEqual(['amount', 'category']);
});

it('не пишет ничего, если поля не изменились', async () => {
  const record = jest.fn();
  const repository = {
    findById: jest.fn().mockResolvedValue({ id: 'tx-1', userId: 'user-1', category: 'other' }),
    update: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  };

  const useCase = new UpdateTransactionUseCase(repository as never, { record } as never);
  await useCase.execute({ id: 'tx-1', category: 'other' });

  expect(record).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/updateTransaction.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Добавить `UpdateTransactionUseCase` необязательную зависимость `correctionsRepository`. После успешного `repository.update` сравнить пришедшие поля с исходной транзакцией и записать по строке на каждое изменившееся. Сравнение уже написано в `updateTransactionWithLearning.ts:88-115` — взять оттуда, не изобретая заново.

Сбой записи в лог **не должен ронять правку**: обернуть в try/catch с логом ошибки, как это сделано в замороженном use case.

- [ ] **Step 4: Прокинуть зависимость**

В `src/modules/transaction/transactionModule.ts` создать `SqliteCorrectionsRepository` через `RepositoryFactory` и передать в `UpdateTransactionUseCase`.

- [ ] **Step 5: Запустить тесты**

Run: `npx jest tests/updateTransaction.test.ts tests/correctionsRepository.test.ts`
Expected: PASS.

- [ ] **Step 6: Полная линейка**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat(transaction): записывать правки в пассивный лог"
```

---

### Task 16: Миграция Supabase

**Files:**
- Create: `migrations/009_corrections.sql`
- Create: `src/modules/transaction/infrastructure/persistence/SupabaseCorrectionsRepository.ts`

**Внимание:** Supabase на паузе, миграции 007 и 008 к нему не применены. **Первым делом** разобраться с этим долгом — иначе порядок применения разъедется. Если разобраться не получается, остановиться и вынести вопрос человеку.

- [ ] **Step 1: Проверить состояние миграций**

Run: `ls -1 migrations/`
Сверить с тем, что реально применено в Supabase. Если 007 и 008 не применены — остановиться и спросить.

- [ ] **Step 2: Написать миграцию**

```sql
-- migrations/009_corrections.sql
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_id uuid not null,
  field text not null check (field in ('amount', 'category', 'type', 'description', 'date')),
  old_value text not null,
  new_value text not null,
  original_text text,
  created_at timestamptz not null default now()
);

create index if not exists corrections_user_id_created_at_idx
  on corrections (user_id, created_at desc);
```

- [ ] **Step 3: Реализовать репозиторий для Supabase**

По образцу `SupabaseTransactionRepository`. Учесть snake_case в базе против camelCase в коде — посмотреть, как это решено для транзакций, и повторить.

- [ ] **Step 4: Зарегистрировать в фабрике**

Добавить `createCorrectionsRepository()` в `RepositoryFactory`, выбирающий реализацию по `DATABASE_TYPE`.

- [ ] **Step 5: Полная линейка**

Run: `npm run verify`
Expected: зелено. Это последняя задача плана — прогнать всю проверку целиком.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat(transaction): поддержать лог правок в Supabase"
```

---

## Что проверить в конце

- [ ] `npm run verify` проходит целиком
- [ ] Бот отвечает на голосовое и на текст, транзакция сохраняется, кнопки одинаковые независимо от уверенности
- [ ] `curl` по замороженным маршрутам даёт 404, по `/api/health` и `/api/voice/text-input` — работает
- [ ] Скрипт замера показывает, что время выборки перестало расти с историей
- [ ] В таблице `corrections` появляются строки после правки транзакции
- [ ] Документация обновлена: `CLAUDE.md` (список модулей), `docs/VISION.md` (готовые фичи) — обе перестали соответствовать после заморозки
