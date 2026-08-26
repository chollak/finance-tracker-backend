/**
 * Список замороженной функциональности.
 *
 * Заморожено 2026-08-26 по спеке docs/superpowers/specs/2026-08-26-capture-core-design.md
 *
 * «Заморожено» означает: код остаётся на месте и продолжает собираться и
 * тестироваться, но его маршруты не регистрируются и в интерфейсе он не появляется.
 *
 * Модули при этом продолжают конструироваться в appModules.ts — от них зависят
 * живые части. В частности, VoiceProcessingModule принимает DebtModule, и без него
 * фразы вроде «занял у Азиза сто тысяч» перестали бы создавать что-либо вообще,
 * а бот отвечал бы «транзакций не найдено». Данные молча терялись бы.
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

/**
 * Заморозка учёта лимитов — выполнена отключением проводки, а не удалением кода.
 *
 * Три места в композиционных корнях, где subscriptionModule перестал передаваться:
 *
 *   appModules.ts  — не вызывается transactionModule.setSubscriptionDependencies()
 *   index.ts       — subscriptionModule не уходит в buildServer()
 *   index.ts       — subscriptionModule не уходит в startTelegramBot()
 *
 * Во всех трёх потребителях зависимость объявлена необязательной и есть готовая
 * ветка без неё (registerMessageHandlers:117-121, createTransaction.ts:56,
 * deleteTransaction.ts:56, transactionController.ts:89). Поэтому проводки
 * достаточно — трогать сами use case'ы не пришлось.
 *
 * ПОЧЕМУ ЭТО ВАЖНЕЕ ПРОСТОЙ ЗАМОРОЗКИ. Учёт лимитов содержал баг, портивший
 * данные. И createTransaction.ts:76, и deleteTransaction.ts:75 вызывают
 * getOrCreateUser({ telegramId: userId }), но userId к этому моменту уже
 * разрезолвлен в UUID (messageHandlers.ts:141). Поиск по telegram_id промахивался,
 * и создавался теневой пользователь, у которого в telegram_id лежит UUID
 * настоящего. В data/database.sqlite таких три штуки; у пары
 * dbab93a0-5ac0-447b-91cd-842947b918c8 и 258e010a-1ab7-4179-801f-8ac61b3d236a
 * счётчики транзакций разошлись на 71 и 26 при бесплатном лимите 50 в месяц.
 * Проверка лимита читала одну строку, инкремент писал в обе.
 *
 * ПЕРЕД РАЗМОРОЗКОЙ обязательно:
 *   1. Заменить сырой getOrCreateUser на resolveUserIdToUUID()
 *      (shared/application/helpers/userIdResolver.ts) в обоих местах — он уже
 *      умеет распознавать UUID и возвращать его как есть.
 *   2. Разобраться с теневыми строками в users и usage_limits.
 *      Решение от 2026-08-26: не трогать, пока подписки заморожены.
 *   3. Убрать двойной инкремент: createTransaction.ts:57 считает блокирующе,
 *      messageHandlers.ts:191 — вдогонку, по разным идентификаторам.
 */
export const FROZEN_WIRING = ['subscription-usage-accounting'] as const;
