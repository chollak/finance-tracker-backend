# Ядро захвата: бэкенд — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сжать бэкенд до ядра захвата: спрятать замороженные фичи за маршрутами, убрать деградацию времени ответа бота, начать копить данные о правках.

**Architecture:** Ядро захвата уже существует (`ProcessTextInputUseCase` / `ProcessVoiceInputUseCase` + маршруты `/api/voice/*`), поэтому работа не в перестройке, а в трёх точках: заморозка регистрации маршрутов в `expressServer.ts`, вынос полной выборки транзакций из критического пути ответа бота, и новая таблица `corrections`. Модули продолжают конструироваться — замораживается их поверхность, а не существование.

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
| `scripts/measure-capture-latency.ts` | Замер базовой задержки | создать |

---

## Фаза 0 — Заморозка

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

## Фаза 1 — Задержка ответа

### Task 5: Замерить базовую задержку

**Files:**
- Create: `scripts/measure-capture-latency.ts`

- [ ] **Step 1: Написать скрипт замера**

Скрипт наполняет локальную базу N транзакциями одного пользователя и замеряет, сколько занимает `getTodaySummary`-подобная выборка при росте N. Цель — получить число до оптимизации, чтобы потом было с чем сравнить.

```typescript
// scripts/measure-capture-latency.ts
import { RepositoryFactory } from '../src/shared/infrastructure/database/repositoryFactory';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

const USER_ID = 'latency-probe-user';
const SIZES = [100, 500, 1000, 3000];

async function main(): Promise<void> {
  const repo = RepositoryFactory.createTransactionRepository();
  let created = 0;

  for (const size of SIZES) {
    while (created < size) {
      const tx: Transaction = {
        date: new Date().toISOString().split('T')[0],
        category: 'other',
        description: `нагрузочная запись ${created}`,
        amount: 1000,
        type: 'expense',
        userId: USER_ID,
      };
      await repo.create(tx);
      created++;
    }

    const startedAt = process.hrtime.bigint();
    const all = await repo.findByUserId(USER_ID);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    console.log(`${size} транзакций → findByUserId вернул ${all.length} за ${elapsedMs.toFixed(1)} мс`);
  }
}

main().catch((error) => {
  console.error('Замер не удался:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Запустить и записать результат**

Run: `npx ts-node scripts/measure-capture-latency.ts`
Expected: четыре строки с растущим временем. **Записать цифры в тело коммита** — это базовая линия, к которой вернёмся в Task 6.

- [ ] **Step 3: Коммит**

```bash
git add scripts/measure-capture-latency.ts
git commit -m "chore(scripts): замерить деградацию выборки транзакций

Базовая линия до оптимизации:
<вставить вывод скрипта>"
```

---

### Task 6: Убрать полную выборку из критического пути

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:340-360`
- Test: `tests/todaySummaryScope.test.ts` (создать)

**Суть:** `getTodaySummary` вызывает `getGetUserTransactionsUseCase().execute(userId)`, то есть тянет всю историю, чтобы посчитать суммы за сегодня и за месяц. Обе суммы укладываются в текущий месяц, а в репозитории уже есть `getByUserIdAndDateRange`. Фильтрация по `needsReview` и `countsAsRealExpense` остаётся в JS — переносить её в SQL значило бы продублировать логику в двух репозиториях, а они на этом уже расходились однажды (коммит `f0ce281`).

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/todaySummaryScope.test.ts
import { getTodaySummaryForTest } from '../src/delivery/messaging/telegram/handlers/messageHandlers';

describe('getTodaySummary', () => {
  it('запрашивает только текущий месяц, а не всю историю', async () => {
    const getByUserIdAndDateRange = jest.fn().mockResolvedValue([]);
    const findByUserId = jest.fn().mockResolvedValue([]);

    const transactionModule = {
      getRepository: () => ({ getByUserIdAndDateRange, findByUserId }),
    };

    await getTodaySummaryForTest(transactionModule as never, 'user-1');

    expect(getByUserIdAndDateRange).toHaveBeenCalledTimes(1);
    expect(findByUserId).not.toHaveBeenCalled();

    const [userId, startDate] = getByUserIdAndDateRange.mock.calls[0];
    const now = new Date();
    expect(userId).toBe('user-1');
    expect(startDate.getMonth()).toBe(now.getMonth());
    expect(startDate.getDate()).toBe(1);
  });

  it('считает сегодняшнюю и месячную суммы по одному ответу репозитория', async () => {
    const today = new Date().toISOString().split('T')[0];
    const earlierThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const getByUserIdAndDateRange = jest.fn().mockResolvedValue([
      { date: today, amount: 100, type: 'expense', semanticType: 'expense', needsReview: false },
      { date: earlierThisMonth, amount: 50, type: 'expense', semanticType: 'expense', needsReview: false },
      { date: today, amount: 999, type: 'expense', semanticType: 'expense', needsReview: true },
    ]);

    const transactionModule = {
      getRepository: () => ({ getByUserIdAndDateRange }),
    };

    const summary = await getTodaySummaryForTest(transactionModule as never, 'user-1');

    expect(summary?.todayTotal).toBe(100);
    expect(summary?.monthTotal).toBe(150);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/todaySummaryScope.test.ts`
Expected: FAIL — `getTodaySummaryForTest` не экспортируется.

- [ ] **Step 3: Переписать getTodaySummary**

В `messageHandlers.ts` заменить обращение к use case на выборку по диапазону и экспортировать функцию для теста:

```typescript
export async function getTodaySummaryForTest(
  transactionModule: BotContext['modules']['transactionModule'],
  userId: string
): Promise<{ todayTotal: number; monthTotal: number } | undefined> {
  return getTodaySummary(transactionModule, userId);
}

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
      if (new Date(tx.date) >= startOfToday) {
        todayTotal += tx.amount;
      }
    }

    return { todayTotal, monthTotal };
  } catch {
    return undefined;
  }
}
```

Геттер `getRepository()` уже существует — `src/modules/transaction/transactionModule.ts:83`. Добавлять ничего не нужно.

- [ ] **Step 4: Запустить тест**

Run: `npx jest tests/todaySummaryScope.test.ts`
Expected: PASS, оба теста.

- [ ] **Step 5: Полная линейка**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 6: Перезамерить**

Run: `npx ts-node scripts/measure-capture-latency.ts`
Сравнить с базовой линией из Task 5. Записать разницу в коммит.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "perf(telegram): не читать всю историю ради сводки за месяц

До: <цифры из Task 5>
После: <новые цифры>"
```

---

### Task 7: Поле source

**Files:**
- Modify: `src/modules/transaction/domain/transactionEntity.ts`
- Modify: `src/modules/voiceProcessing/application/processTextInput.ts`
- Modify: `src/modules/voiceProcessing/application/processVoiceInput.ts`
- Modify: `src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository.ts`
- Modify: `src/modules/transaction/infrastructure/persistence/SupabaseTransactionRepository.ts`
- Test: `tests/transactionSource.test.ts` (создать)

- [ ] **Step 1: Написать падающий тест**

```typescript
// tests/transactionSource.test.ts
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';

describe('source транзакции', () => {
  it('проставляется из вызывающего клиента', async () => {
    const created: unknown[] = [];
    const createTransactionUseCase = {
      execute: jest.fn(async (tx: unknown) => {
        created.push(tx);
        return { success: true, data: 'tx-1' };
      }),
    };
    const openAIService = { analyzeInput: jest.fn() };

    const useCase = new ProcessTextInputUseCase(
      openAIService as never,
      createTransactionUseCase as never
    );

    await useCase.execute('такси 18000', 'user-1', 'Тест', 'telegram');

    expect((created[0] as { source?: string }).source).toBe('telegram');
  });

  it('по умолчанию telegram, если клиент не указан', async () => {
    const created: unknown[] = [];
    const createTransactionUseCase = {
      execute: jest.fn(async (tx: unknown) => {
        created.push(tx);
        return { success: true, data: 'tx-1' };
      }),
    };

    const useCase = new ProcessTextInputUseCase(
      { analyzeInput: jest.fn() } as never,
      createTransactionUseCase as never
    );

    await useCase.execute('такси 18000', 'user-1', 'Тест');

    expect((created[0] as { source?: string }).source).toBe('telegram');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/transactionSource.test.ts`
Expected: FAIL — `source` не определён.

- [ ] **Step 3: Добавить поле в сущность**

В `transactionEntity.ts`:

```typescript
export type TransactionSource = 'telegram' | 'shortcut' | 'webapp';
```

и в интерфейс `Transaction`:

```typescript
    /** Откуда пришла запись. Нужно, чтобы отличать каналы захвата при анализе. */
    source?: TransactionSource;
```

- [ ] **Step 4: Пробросить через use case**

В `ProcessTextInputUseCase.execute` и `ProcessVoiceInputUseCase.execute` добавить необязательный параметр `source: TransactionSource = 'telegram'` и положить его в собираемый объект `Transaction`.

- [ ] **Step 5: Сохранять в обеих базах**

Добавить колонку в TypeORM-сущность SQLite и маппинг в обоих репозиториях. Свериться с тем, как хранится `originalParsing` — там уже решена задача сохранения необязательного поля, повторить тот же приём.

- [ ] **Step 6: Запустить тесты репозиториев**

Run: `npx jest tests/sqliteTransactionRepository.test.ts tests/supabaseTransactionRepository.test.ts tests/transactionSource.test.ts`
Expected: PASS.

- [ ] **Step 7: Полная линейка**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 8: Коммит**

```bash
git add -A
git commit -m "feat(transaction): записывать канал захвата в поле source"
```

---

### Task 8: Снять ветку подтверждения

**Files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts:310-335`
- Test: `tests/telegramMessageHandlers.test.ts`

- [ ] **Step 1: Написать падающий тест**

Тест проверяет, что при низкой уверенности показывается та же клавиатура, что и при высокой — то есть лишнего шага подтверждения нет.

```typescript
it('при низкой уверенности показывает ту же клавиатуру, что и при высокой', async () => {
  const lowConfidence = buildKeyboardFor({ confidence: 0.2 });
  const highConfidence = buildKeyboardFor({ confidence: 0.95 });

  expect(lowConfidence).toEqual(highConfidence);
});
```

Форму `buildKeyboardFor` подогнать под то, как устроен существующий файл теста — сначала прочитать его целиком.

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx jest tests/telegramMessageHandlers.test.ts`
Expected: FAIL — при 0.2 возвращается `transactionConfirmationKeyboard`.

- [ ] **Step 3: Убрать выбор клавиатуры**

В `sendTransactionResponse` заменить

```typescript
const keyboard = needsConfirmation
  ? transactionConfirmationKeyboard(tx.id, userId)
  : transactionAutoSavedKeyboard(tx.id, userId);
```

на

```typescript
// Подтверждение снято намеренно: лишний шаг в каждом случае ради ошибок в меньшинстве.
// Низкая уверенность остаётся видимой в тексте карточки (formatTransactionMessage).
const keyboard = transactionAutoSavedKeyboard(tx.id, userId);
```

`CONFIDENCE_THRESHOLD` и `needsConfirmation` оставить — они по-прежнему управляют подсветкой в `formatTransactionMessage`. Импорт `transactionConfirmationKeyboard` убрать, сам файл клавиатуры оставить.

- [ ] **Step 4: Запустить тест**

Run: `npx jest tests/telegramMessageHandlers.test.ts tests/telegramFormatters.test.ts`
Expected: PASS.

- [ ] **Step 5: Полная линейка**

Run: `npm run build && npm run test:ci`
Expected: зелено.

- [ ] **Step 6: Проверить руками**

Run: `npm run dev`, отправить боту «такси 18 тысяч» и невнятную фразу вроде «ну там это тысяч пять наверное».
Expected: обе записаны, обе с одинаковым набором кнопок, вторая помечена как требующая внимания в тексте.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat(telegram): убрать шаг подтверждения из захвата"
```

---

## Фаза 3 — Пассивный лог правок

### Task 9: Интерфейс и SQLite-реализация лога

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

### Task 10: Писать в лог при правке транзакции

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

### Task 11: Миграция Supabase

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
