import { CreateDebtUseCase } from '../src/modules/debt/application/createDebt';
import { PayDebtUseCase } from '../src/modules/debt/application/payDebt';
import { UpdateDebtUseCase } from '../src/modules/debt/application/updateDebt';
import { DeleteDebtUseCase } from '../src/modules/debt/application/deleteDebt';
import { GetDebtsUseCase } from '../src/modules/debt/application/getDebts';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { DebtRepository } from '../src/modules/debt/domain/debtRepository';
import {
  DebtEntity,
  DebtPaymentEntity,
  CreateDebtData,
  UpdateDebtData,
  PayDebtData,
  DebtSummary,
  DebtWithPayments,
  DebtStatus,
  DebtType,
} from '../src/modules/debt/domain/debtEntity';
import { ResultHelper } from '../src/shared/domain/types/Result';

/**
 * In-memory fake repository mimicking the persistence contract that
 * PayDebtUseCase relies on: addPayment() decrements remainingAmount and
 * flips status to PAID once fully paid.
 */
class InMemoryDebtRepository implements DebtRepository {
  private debts = new Map<string, DebtEntity>();
  private payments = new Map<string, DebtPaymentEntity>();
  private debtSeq = 0;
  private paymentSeq = 0;

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
      splitGroupId: data.splitGroupId,
      splitExpenseId: data.splitExpenseId,
    };
    this.debts.set(id, debt);
    return debt;
  }

  async findById(id: string): Promise<DebtEntity | null> {
    return this.debts.get(id) ?? null;
  }

  async findByUserId(userId: string, status?: DebtStatus): Promise<DebtEntity[]> {
    return [...this.debts.values()].filter(
      (d) => d.userId === userId && (!status || d.status === status)
    );
  }

  async findByType(userId: string, type: DebtType): Promise<DebtEntity[]> {
    return [...this.debts.values()].filter((d) => d.userId === userId && d.type === type);
  }

  async update(id: string, data: UpdateDebtData): Promise<DebtEntity> {
    const existing = this.debts.get(id);
    if (!existing) {
      throw new Error('Debt not found');
    }
    const updated: DebtEntity = {
      ...existing,
      ...data,
      dueDate: data.dueDate === null ? undefined : data.dueDate ?? existing.dueDate,
      updatedAt: new Date(),
    };
    this.debts.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.debts.delete(id);
  }

  async findWithPayments(id: string): Promise<DebtWithPayments | null> {
    const debt = this.debts.get(id);
    if (!debt) return null;
    const payments = [...this.payments.values()].filter((p) => p.debtId === id);
    return { ...debt, payments };
  }

  async addPayment(data: PayDebtData): Promise<DebtPaymentEntity> {
    const debt = this.debts.get(data.debtId);
    if (!debt) {
      throw new Error('Debt not found');
    }

    const id = `payment-${++this.paymentSeq}`;
    const now = new Date();
    const payment: DebtPaymentEntity = {
      id,
      debtId: data.debtId,
      amount: data.amount,
      note: data.note,
      paidAt: now,
      createdAt: now,
    };
    this.payments.set(id, payment);

    const remainingAmount = Math.max(debt.remainingAmount - data.amount, 0);
    this.debts.set(data.debtId, {
      ...debt,
      remainingAmount,
      status: remainingAmount === 0 ? DebtStatus.PAID : debt.status,
      updatedAt: now,
    });

    return payment;
  }

  async findPaymentById(paymentId: string): Promise<DebtPaymentEntity | null> {
    return this.payments.get(paymentId) ?? null;
  }

  async findPaymentsByDebtId(debtId: string): Promise<DebtPaymentEntity[]> {
    return [...this.payments.values()].filter((p) => p.debtId === debtId);
  }

  async deletePayment(paymentId: string): Promise<void> {
    this.payments.delete(paymentId);
  }

  async getSummary(_userId: string): Promise<DebtSummary> {
    throw new Error('Not needed for these tests');
  }

  async updateRemainingAmount(debtId: string, amount: number): Promise<void> {
    const debt = this.debts.get(debtId);
    if (debt) this.debts.set(debtId, { ...debt, remainingAmount: amount });
  }

  async markAsPaid(debtId: string): Promise<void> {
    const debt = this.debts.get(debtId);
    if (debt) this.debts.set(debtId, { ...debt, status: DebtStatus.PAID });
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
  let payDebtUseCase: PayDebtUseCase;
  let updateDebtUseCase: UpdateDebtUseCase;
  let deleteDebtUseCase: DeleteDebtUseCase;
  let getDebtsUseCase: GetDebtsUseCase;

  beforeEach(() => {
    repo = new InMemoryDebtRepository();
    createTransactionUseCase = createFakeTransactionUseCase();
    createDebtUseCase = new CreateDebtUseCase(repo, createTransactionUseCase);
    payDebtUseCase = new PayDebtUseCase(repo, createTransactionUseCase);
    updateDebtUseCase = new UpdateDebtUseCase(repo);
    deleteDebtUseCase = new DeleteDebtUseCase(repo);
    getDebtsUseCase = new GetDebtsUseCase(repo);
  });

  async function createActiveDebt(overrides: Partial<CreateDebtData> = {}): Promise<DebtEntity> {
    const data: CreateDebtData = {
      userId: 'user-1',
      type: DebtType.I_OWE,
      personName: 'Alice',
      amount: 1000,
      ...overrides,
    };
    const result = await createDebtUseCase.execute(data);
    if (!result.success) {
      throw new Error(`setup failed: ${result.error.message}`);
    }
    return result.data;
  }

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

  describe('PayDebtUseCase', () => {
    it('partial payment decreases remaining amount, keeps debt active, and records payment history', async () => {
      const debt = await createActiveDebt({ amount: 1000 });

      const result = await payDebtUseCase.execute({ debtId: debt.id, amount: 400, note: 'first installment' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(400);
        expect(result.data.debtId).toBe(debt.id);
      }

      const updated = await repo.findById(debt.id);
      expect(updated?.remainingAmount).toBe(600);
      expect(updated?.status).toBe(DebtStatus.ACTIVE);

      const payments = await repo.findPaymentsByDebtId(debt.id);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(400);
      expect(payments[0].note).toBe('first installment');
    });

    it('full payment marks the debt as paid with zero remaining amount', async () => {
      const debt = await createActiveDebt({ amount: 500 });

      const result = await payDebtUseCase.executePayFull(debt.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(500);
      }

      const updated = await repo.findById(debt.id);
      expect(updated?.status).toBe(DebtStatus.PAID);
      expect(updated?.remainingAmount).toBe(0);
    });

    it('creates a linked transaction on payment by default', async () => {
      const debt = await createActiveDebt({ amount: 1000 });

      await payDebtUseCase.execute({ debtId: debt.id, amount: 200 });

      expect(createTransactionUseCase.execute).toHaveBeenCalledTimes(1);
      const callArg = (createTransactionUseCase.execute as jest.Mock).mock.calls[0][0];
      expect(callArg.amount).toBe(200);
      // I_OWE debt being paid back by the user = expense
      expect(callArg.type).toBe('expense');
      expect(callArg.isDebtRelated).toBe(true);
    });

    it('skips creating a transaction when createTransaction=false', async () => {
      const debt = await createActiveDebt({ amount: 1000 });

      await payDebtUseCase.execute({ debtId: debt.id, amount: 200 }, false);

      expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
    });

    it('rejects a payment that exceeds the remaining amount', async () => {
      const debt = await createActiveDebt({ amount: 300 });

      const result = await payDebtUseCase.execute({ debtId: debt.id, amount: 500 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('exceeds remaining debt');
      }

      const unchanged = await repo.findById(debt.id);
      expect(unchanged?.remainingAmount).toBe(300);
      expect(unchanged?.status).toBe(DebtStatus.ACTIVE);
    });

    it('rejects a payment on an already-paid (non-active) debt', async () => {
      const debt = await createActiveDebt({ amount: 100 });
      await payDebtUseCase.executePayFull(debt.id);

      const result = await payDebtUseCase.execute({ debtId: debt.id, amount: 50 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Cannot pay a non-active debt');
      }
    });

    it('fails with a not-found error for an unknown debt id', async () => {
      const result = await payDebtUseCase.execute({ debtId: 'missing-debt', amount: 100 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('fails validation when payment amount is not positive', async () => {
      const debt = await createActiveDebt();

      const result = await payDebtUseCase.execute({ debtId: debt.id, amount: 0 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Amount must be greater than 0');
      }
    });

    it('fails validation when debtId is missing', async () => {
      const result = await payDebtUseCase.execute({ debtId: '', amount: 100 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Debt ID is required');
      }
    });
  });

  describe('UpdateDebtUseCase', () => {
    it('updates mutable fields on an existing debt', async () => {
      const debt = await createActiveDebt({ personName: 'Alice' });

      const result = await updateDebtUseCase.execute(debt.id, { personName: 'Alice Updated' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.personName).toBe('Alice Updated');
      }
    });

    it('fails when the debt does not exist', async () => {
      const result = await updateDebtUseCase.execute('missing-debt', { personName: 'X' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Debt not found');
      }
    });

    it('cancels a debt via executeCancel', async () => {
      const debt = await createActiveDebt();

      const result = await updateDebtUseCase.executeCancel(debt.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DebtStatus.CANCELLED);
      }
    });
  });

  describe('DeleteDebtUseCase', () => {
    it('deletes an existing debt', async () => {
      const debt = await createActiveDebt();

      const result = await deleteDebtUseCase.execute(debt.id);

      expect(result.success).toBe(true);
      expect(await repo.findById(debt.id)).toBeNull();
    });

    it('fails when deleting a non-existent debt', async () => {
      const result = await deleteDebtUseCase.execute('missing-debt');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Debt not found');
      }
    });
  });

  describe('GetDebtsUseCase', () => {
    it('lists only debts matching the requested status for a user', async () => {
      await createActiveDebt({ personName: 'Alice', amount: 100 });
      const toBePaid = await createActiveDebt({ personName: 'Bob', amount: 50 });
      await payDebtUseCase.executePayFull(toBePaid.id);

      const activeResult = await getDebtsUseCase.executeGetAll('user-1', DebtStatus.ACTIVE);

      expect(activeResult.success).toBe(true);
      if (activeResult.success) {
        expect(activeResult.data).toHaveLength(1);
        expect(activeResult.data[0].personName).toBe('Alice');
      }
    });

    it('fails validation when userId is missing', async () => {
      const result = await getDebtsUseCase.executeGetAll('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('User ID is required');
      }
    });
  });
});
