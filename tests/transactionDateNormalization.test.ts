/**
 * Колонка date сравнивается в SQL как строка. Полный ISO
 * ('2026-08-26T12:00:00.000Z') не проходит условие date <= '2026-08-26',
 * поэтому такая запись выпадает из любой выборки по диапазону дат.
 *
 * В data/database.sqlite одна строка из 29 уже была сохранена в формате ISO —
 * баг не теоретический, он сработал.
 */
import { normalizeTransactionDate, Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

function repositoryCapturing(saved: Transaction[]): TransactionRepository {
  return {
    create: jest.fn(async (tx: Transaction) => {
      saved.push(tx);
      return { ...tx, id: 'tx-1' };
    }),
    getAll: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    update: jest.fn(),
    getByUserIdAndDateRange: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    archiveMultiple: jest.fn(),
    archiveAllByUserId: jest.fn(),
    findArchivedByUserId: jest.fn(),
    findByIdIncludingArchived: jest.fn(),
  } as unknown as TransactionRepository;
}

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
    expect(normalizeTransactionDate(new Date('нечто'))).toBe(today);
  });

  it('результат всегда пригоден для строкового сравнения в SQL', () => {
    const inputs = [
      '2026-01-21T04:20:47.000Z',
      '2026-01-21',
      new Date('2026-01-21T23:59:59.999Z'),
      'мусор',
    ];

    for (const input of inputs) {
      expect(normalizeTransactionDate(input)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('CreateTransactionUseCase — единственный вход для нормализации', () => {
  it('приводит полный ISO к календарному дню перед сохранением', async () => {
    const saved: Transaction[] = [];
    const useCase = new CreateTransactionUseCase(repositoryCapturing(saved));

    await useCase.execute({
      // Ровно то, что кладёт быстрое добавление в боте: new Date().toISOString()
      date: '2026-08-26T12:34:56.789Z',
      category: 'groceries',
      description: 'Продукты',
      amount: 45000,
      type: 'expense',
      userId: 'user-1',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].date).toBe('2026-08-26');
  });

  it('не трогает дату, уже приведённую к календарному дню', async () => {
    const saved: Transaction[] = [];
    const useCase = new CreateTransactionUseCase(repositoryCapturing(saved));

    await useCase.execute({
      date: '2026-08-20',
      category: 'taxi',
      description: 'Такси',
      amount: 18000,
      type: 'expense',
      userId: 'user-1',
    });

    expect(saved[0].date).toBe('2026-08-20');
  });

  it('сохранённая дата всегда проходит строковое сравнение диапазона', async () => {
    const saved: Transaction[] = [];
    const useCase = new CreateTransactionUseCase(repositoryCapturing(saved));

    await useCase.execute({
      date: '2026-08-26T23:59:59.999Z',
      category: 'coffee',
      description: 'Кофе',
      amount: 25000,
      type: 'expense',
      userId: 'user-1',
    });

    // Именно это условие раньше давало ложь и теряло запись из сводки.
    expect(saved[0].date <= '2026-08-26').toBe(true);
    expect(saved[0].date >= '2026-08-01').toBe(true);
  });
});
