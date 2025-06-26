import { runDailyAnalytics } from '../src/workers/dailyAnalytics';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import fs from 'fs/promises';

describe('runDailyAnalytics', () => {
  it('writes batch results for yesterday', async () => {
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const transactions: Transaction[] = [
      { date, category: 'Food', description: 'lunch', amount: 10, type: 'expense', userId: 'u1' },
      { date: '2020-01-01', category: 'Other', description: 'old', amount: 5, type: 'expense', userId: 'u1' }
    ];

    const repo: TransactionRepository = {
      save: jest.fn(),
      getAll: jest.fn().mockResolvedValue(transactions)
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ processed: 1 })
    });
    (global as any).fetch = fetchMock;

    const mkdirMock = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    const writeFileMock = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);

    await runDailyAnalytics(repo, 'http://svc/batch', '/tmp/out');

    expect(fetchMock).toHaveBeenCalledWith('http://svc/batch', expect.objectContaining({ method: 'POST' }));
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/out', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(`/tmp/out/${date}.json`, JSON.stringify({ processed: 1 }));
  });
});
