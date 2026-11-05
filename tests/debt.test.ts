import { CreateDebtUseCase } from '../src/modules/debt/application/createDebt';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { DebtRepository } from '../src/modules/debt/domain/debtRepository';
import { DebtEntity, CreateDebtData, DebtStatus, DebtType } from '../src/modules/debt/domain/debtEntity';
import { ResultHelper } from '../src/shared/domain/types/Result';

/**
 * What is left of the debt module (#265): CreateDebtUseCase, which the frozen capture path still holds until #266.
 * The tests of the debt routes, reads, payments and limits went with their code.
 */

/** In-memory fake of the one write the use case makes. */
class InMemoryDebtRepository implements DebtRepository {
  private debts = new Map<string, DebtEntity>();
  private debtSeq = 0;

  async create(data: CreateDebtData): Promise<DebtEntity> {
    const id = `debt-${++this.debtSeq}`;
    const now = new Date();
    const debt: DebtEntity = {
      id,
      userId: data.userId,
      type: data.type,
      personName: data.personName,
      originalAmount: data.amount,
      remainingAmount: data.amount,
      currency: data.currency || 'UZS',
      description: data.description,
      status: DebtStatus.ACTIVE,
      dueDate: data.dueDate,
      createdAt: now,
      updatedAt: now,
    };
    this.debts.set(id, debt);
    return debt;
  }
}

function createFakeTransactionUseCase(): CreateTransactionUseCase {
  return {
    execute: jest.fn().mockResolvedValue(ResultHelper.success('txn-1')),
  } as unknown as CreateTransactionUseCase;
}

describe('Debt module', () => {
  let repo: InMemoryDebtRepository;
  let createTransactionUseCase: CreateTransactionUseCase;
  let createDebtUseCase: CreateDebtUseCase;

  beforeEach(() => {
    repo = new InMemoryDebtRepository();
    createTransactionUseCase = createFakeTransactionUseCase();
    createDebtUseCase = new CreateDebtUseCase(repo, createTransactionUseCase);
  });

  describe('CreateDebtUseCase', () => {
    it('stores expected fields with ACTIVE status and remainingAmount = originalAmount by default', async () => {
      const result = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.I_OWE,
        personName: 'Alice',
        amount: 1000,
        currency: 'UZS',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.personName).toBe('Alice');
        expect(result.data.type).toBe(DebtType.I_OWE);
        expect(result.data.originalAmount).toBe(1000);
        expect(result.data.remainingAmount).toBe(1000);
        expect(result.data.currency).toBe('UZS');
        expect(result.data.status).toBe(DebtStatus.ACTIVE);
      }
      expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
    });

    it('creates a linked transaction only when moneyTransferred is true', async () => {
      const result = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.OWED_TO_ME,
        personName: 'Bob',
        amount: 500,
        moneyTransferred: true,
      });

      expect(result.success).toBe(true);
      expect(createTransactionUseCase.execute).toHaveBeenCalledTimes(1);
      const callArg = (createTransactionUseCase.execute as jest.Mock).mock.calls[0][0];
      expect(callArg.isDebtRelated).toBe(true);
      expect(callArg.amount).toBe(500);
      // OWED_TO_ME = user gave money away = recorded as an expense
      expect(callArg.type).toBe('expense');
    });

    it('marks the linked transaction as semanticType "debt" for both debt directions', async () => {
      const owedToMe = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.OWED_TO_ME,
        personName: 'Bob',
        amount: 500,
        moneyTransferred: true,
      });
      expect(owedToMe.success).toBe(true);

      const iOwe = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.I_OWE,
        personName: 'Carol',
        amount: 700,
        moneyTransferred: true,
      });
      expect(iOwe.success).toBe(true);

      const calls = (createTransactionUseCase.execute as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);

      const [owedToMeArg] = calls[0];
      expect(owedToMeArg.semanticType).toBe('debt');
      expect(owedToMeArg.needsReview).toBe(false);
      expect(owedToMeArg.type).toBe('expense');
      expect(owedToMeArg.isDebtRelated).toBe(true);
      expect(owedToMeArg.relatedDebtId).toBeTruthy();

      const [iOweArg] = calls[1];
      expect(iOweArg.semanticType).toBe('debt');
      expect(iOweArg.needsReview).toBe(false);
      expect(iOweArg.type).toBe('income');
      expect(iOweArg.isDebtRelated).toBe(true);
      expect(iOweArg.relatedDebtId).toBeTruthy();
    });

    it('fails validation when person name is missing', async () => {
      const result = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.I_OWE,
        personName: '',
        amount: 100,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Person name is required');
      }
    });

    it('fails validation when amount is not positive', async () => {
      const result = await createDebtUseCase.execute({
        userId: 'user-1',
        type: DebtType.I_OWE,
        personName: 'Alice',
        amount: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Amount must be greater than 0');
      }
    });

    it('fails validation for an invalid debt type', async () => {
      const result = await createDebtUseCase.execute({
        userId: 'user-1',
        type: 'not_a_real_type' as DebtType,
        personName: 'Alice',
        amount: 100,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid debt type');
      }
    });
  });

  describe('the day of a debt\'s transaction (FT-175)', () => {
    // 01:30 on the 29th in Tashkent, still the 28th by UTC
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-10-28T20:30:00.000Z')));
    afterEach(() => jest.useRealTimers());

    it('is the Tashkent day when the debt is given', async () => {
      await createDebtUseCase.execute({ userId: 'user-1', type: DebtType.OWED_TO_ME, personName: 'Bob', amount: 500, moneyTransferred: true });

      const dates = (createTransactionUseCase.execute as jest.Mock).mock.calls.map(([transaction]) => transaction.date);
      expect(dates).toEqual(['2026-10-29']);
    });
  });
});
