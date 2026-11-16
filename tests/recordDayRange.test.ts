import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { GetFrequentRecordsUseCase } from '../src/modules/transaction/application/getFrequentRecords';

/**
 * #275: the records of a period are asked for by their days, `YYYY-MM-DD`, both included — not by a `Date` the
 * repository turned back into a day through `toISOString()`, where a local `Date` would move the day. The totals of a
 * day and of a month, the analytics, the audit and the quick chips read through it.
 */
describe('records between two days (#275)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(date: string, description = 'кофе'): Promise<string> {
    const created = await records.create.execute({
      userId: 'user-1', amount: 25000, type: 'expense', category: 'Кафе', description, date,
    } as never);
    if (!created.success) throw created.error;
    return created.data;
  }

  const daysOf = async (from: string, to: string) =>
    (await records.repository.getByUserIdAndDateRange('user-1', from, to)).map(record => record.date.slice(0, 10)).sort();

  it('a month is its first and last day, not the day before or after', async () => {
    for (const date of ['2026-10-31', '2026-11-01', '2026-11-15', '2026-11-30', '2026-12-01']) await record(date);

    expect(await daysOf('2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-15', '2026-11-30']);
    expect(await daysOf('2026-11-30', '2026-11-30')).toEqual(['2026-11-30']);
    expect(await daysOf('2026-12-01', '2026-12-31')).toEqual(['2026-12-01']);
  });

  it('a record saved before FT-100 with a full moment counts on the day it names', async () => {
    const late = await record('2026-11-30');
    // 23:30 UTC is already 1 December in Tashkent, but the stored day is the 30th, as everywhere else it is read
    await db.dataSource.query('UPDATE transactions SET date = ? WHERE id = ?', ['2026-11-30T23:30:00.000Z', late]);

    expect(await daysOf('2026-11-01', '2026-11-30')).toEqual(['2026-11-30']);
    expect(await daysOf('2026-12-01', '2026-12-01')).toEqual([]);
  });

  it('the quick chips read the 30 days up to today: the 31st day back is out', async () => {
    for (let i = 0; i < 3; i += 1) await record('2026-10-03', 'такси');
    for (let i = 0; i < 3; i += 1) await record('2026-10-02', 'шаурма');

    const frequent = await new GetFrequentRecordsUseCase(records.repository).execute({ userId: 'user-1', today: '2026-11-01' });

    expect(frequent.success && frequent.data.items.map(item => item.note)).toEqual(['такси']);
  });
});
