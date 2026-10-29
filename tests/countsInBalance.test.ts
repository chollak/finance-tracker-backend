import { countsInBalance } from '../src/modules/account/domain/account';

/**
 * FT-163: on the opening day the balance counts only what was written from the moment the first launch entered the
 * opening balance; other days go by the date, as before.
 */
describe('countsInBalance', () => {
  const launched = { openingDate: '2026-10-29', openingAt: '2026-10-29T06:15:30.400Z' };
  const at = (date: string, createdAt: string | null) => countsInBalance(launched, { date, createdAt });

  it('leaves out what was written on the opening day before the first launch', () => {
    expect(at('2026-10-29', '2026-10-29T03:00:00.000Z')).toBe(false);
    expect(at('2026-10-29', '2026-10-29T06:15:29.000Z')).toBe(false);
  });

  it('counts what was written on the opening day from the first launch on, the same second too', () => {
    // Records keep createdAt to the second: one written in the same second as the first launch counts
    expect(at('2026-10-29', '2026-10-29T06:15:30.000Z')).toBe(true);
    expect(at('2026-10-29', '2026-10-29T06:15:31.000Z')).toBe(true);
    expect(at('2026-10-29', '2026-10-29T18:00:00.000Z')).toBe(true);
  });

  it('goes by the date on other days: before never, after always', () => {
    expect(at('2026-10-28', '2026-10-29T18:00:00.000Z')).toBe(false);
    // Dated tomorrow but written before the first launch: the money has not moved yet at the first launch
    expect(at('2026-10-30', '2026-10-29T03:00:00.000Z')).toBe(true);
  });

  it('reads the day of a record that keeps a full moment in its date (before FT-100)', () => {
    expect(at('2026-10-29T02:00:00.000Z', '2026-10-29T03:00:00.000Z')).toBe(false);
    expect(at('2026-10-29T09:00:00.000Z', '2026-10-29T09:00:00.000Z')).toBe(true);
  });

  it('counts the whole opening day when the opening balance has no moment', () => {
    const added = { openingDate: '2026-10-29', openingAt: null };
    expect(countsInBalance(added, { date: '2026-10-29', createdAt: '2026-10-29T00:00:01.000Z' })).toBe(true);
    expect(countsInBalance(added, { date: '2026-10-28', createdAt: '2026-10-29T00:00:01.000Z' })).toBe(false);
  });
});
