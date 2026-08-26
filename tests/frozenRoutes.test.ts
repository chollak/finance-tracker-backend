/**
 * Охраняет список замороженного (src/frozen.ts).
 *
 * Заморозка живёт в двух местах: этот список и отсутствие регистрации в
 * expressServer.ts. Тест следит, чтобы список не расползался молча — если
 * кто-то добавит или уберёт путь, здесь станет видно.
 *
 * Поведение самого Express тут не проверяется намеренно: buildServer требует
 * полной сборки модулей, и честно подставить их дороже, чем полезно. Ровно
 * та же причина описана в шапке apiRoutes.test.ts.
 */
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
    expect(isRouteFrozen('/health')).toBe(false);
  });

  it('считает замороженным каждый путь из списка', () => {
    for (const route of FROZEN_ROUTES) {
      expect(isRouteFrozen(route)).toBe(true);
    }
  });
});
