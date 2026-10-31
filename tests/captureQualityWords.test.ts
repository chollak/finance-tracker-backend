import { afterOutOf, plural } from '../scripts/capture-quality/words';

/** Words next to numbers in the capture quality report (FT-217): «21 запись», «из 21 записи». */
describe('capture quality report: words (FT-217)', () => {
  const RECORDS: [string, string, string] = ['запись', 'записи', 'записей'];

  it('counts: 1 запись, 2 записи, 5 записей', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 111].map(n => `${n} ${plural(n, RECORDS)}`)).toEqual([
      '1 запись', '2 записи', '4 записи', '5 записей', '11 записей', '12 записей', '14 записей', '21 запись',
      '22 записи', '25 записей', '111 записей',
    ]);
  });

  it('after «из»: из 1 записи, из 2 записей, из 21 записи', () => {
    const forms: [string, string] = ['записи', 'записей'];
    expect([0, 1, 2, 5, 11, 21, 22, 101, 111].map(n => `из ${n} ${afterOutOf(n, forms)}`)).toEqual([
      'из 0 записей', 'из 1 записи', 'из 2 записей', 'из 5 записей', 'из 11 записей', 'из 21 записи', 'из 22 записей',
      'из 101 записи', 'из 111 записей',
    ]);
  });
});
