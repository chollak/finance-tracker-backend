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
