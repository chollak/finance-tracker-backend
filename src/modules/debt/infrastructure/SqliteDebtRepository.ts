import { Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Debt } from '../../../shared/infrastructure/database/entities/Debt';
import { DebtPayment } from '../../../shared/infrastructure/database/entities/DebtPayment';
import { DebtRepository } from '../domain/debtRepository';
import {
  DebtEntity,
  DebtPaymentEntity,
  CreateDebtData,
  UpdateDebtData,
  PayDebtData,
  DebtSummary,
  DebtWithPayments,
  DebtStatus,
  DebtType
} from '../domain/debtEntity';

export class SqliteDebtRepository implements DebtRepository {
  private debtRepository: Repository<Debt>;
  private paymentRepository: Repository<DebtPayment>;

  constructor() {
    this.debtRepository = AppDataSource.getRepository(Debt);
    this.paymentRepository = AppDataSource.getRepository(DebtPayment);
  }

  async create(data: CreateDebtData): Promise<DebtEntity> {
    const debt = this.debtRepository.create({
      userId: data.userId,
      type: data.type,
      personName: data.personName,
      originalAmount: data.amount,
      remainingAmount: data.amount,
      currency: data.currency || 'UZS',
      description: data.description,
      dueDate: data.dueDate,
      status: DebtStatus.ACTIVE
    });

    const savedDebt = await this.debtRepository.save(debt);
    return this.mapToEntity(savedDebt);
  }

  async findById(id: string): Promise<DebtEntity | null> {
    const debt = await this.debtRepository.findOne({ where: { id } });
    return debt ? this.mapToEntity(debt) : null;
  }

  async findByUserId(userId: string, status?: DebtStatus): Promise<DebtEntity[]> {
    const whereClause: any = { userId };
    if (status) {
      whereClause.status = status;
    }

    const debts = await this.debtRepository.find({
      where: whereClause,
      order: { createdAt: 'DESC' }
    });

    return debts.map(debt => this.mapToEntity(debt));
  }

  async findByType(userId: string, type: DebtType): Promise<DebtEntity[]> {
    const debts = await this.debtRepository.find({
      where: { userId, type },
      order: { createdAt: 'DESC' }
    });

    return debts.map(debt => this.mapToEntity(debt));
  }

  async update(id: string, data: UpdateDebtData): Promise<DebtEntity> {
    const updatePayload: any = {};

    if (data.personName !== undefined) updatePayload.personName = data.personName;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate;
    if (data.status !== undefined) updatePayload.status = data.status;

    await this.debtRepository.update(id, updatePayload);

    const updatedDebt = await this.debtRepository.findOne({ where: { id } });
    if (!updatedDebt) {
      throw new Error('Debt not found after update');
    }

    return this.mapToEntity(updatedDebt);
  }

  async delete(id: string): Promise<void> {
    await this.debtRepository.delete(id);
  }

  async findWithPayments(id: string): Promise<DebtWithPayments | null> {
    const debt = await this.debtRepository.findOne({
      where: { id },
      relations: ['payments']
    });

    if (!debt) return null;

    return {
      ...this.mapToEntity(debt),
      payments: (debt.payments || []).map(p => this.mapPaymentToEntity(p))
    };
  }

  async addPayment(data: PayDebtData): Promise<DebtPaymentEntity> {
    const debt = await this.debtRepository.findOne({ where: { id: data.debtId } });
    if (!debt) {
      throw new Error('Debt not found');
    }

    const payment = this.paymentRepository.create({
      debtId: data.debtId,
      amount: data.amount,
      note: data.note,
      paidAt: new Date()
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Update remaining amount
    const newRemaining = Number(debt.remainingAmount) - data.amount;
    await this.debtRepository.update(data.debtId, {
      remainingAmount: Math.max(0, newRemaining)
    });

    // Mark as paid if fully paid
    if (newRemaining <= 0) {
      await this.markAsPaid(data.debtId);
    }

    return this.mapPaymentToEntity(savedPayment);
  }

  async findPaymentById(paymentId: string): Promise<DebtPaymentEntity | null> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    return payment ? this.mapPaymentToEntity(payment) : null;
  }

  async findPaymentsByDebtId(debtId: string): Promise<DebtPaymentEntity[]> {
    const payments = await this.paymentRepository.find({
      where: { debtId },
      order: { paidAt: 'DESC' }
    });

    return payments.map(p => this.mapPaymentToEntity(p));
  }

  async deletePayment(paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Restore the amount to remaining
    const debt = await this.debtRepository.findOne({ where: { id: payment.debtId } });
    if (debt) {
      const newRemaining = Number(debt.remainingAmount) + Number(payment.amount);
      await this.debtRepository.update(payment.debtId, {
        remainingAmount: newRemaining,
        status: DebtStatus.ACTIVE // Reactivate if was paid
      });
    }

    await this.paymentRepository.delete(paymentId);
  }

  async getSummary(userId: string): Promise<DebtSummary> {
    const debts = await this.debtRepository.find({
      where: { userId, status: DebtStatus.ACTIVE }
    });

    let totalIOwe = 0;
    let totalOwedToMe = 0;
    let iOweCount = 0;
    let owedToMeCount = 0;

    for (const debt of debts) {
      if (debt.type === DebtType.I_OWE) {
        totalIOwe += Number(debt.remainingAmount);
        iOweCount++;
      } else {
        totalOwedToMe += Number(debt.remainingAmount);
        owedToMeCount++;
      }
    }

    return {
      totalIOwe,
      totalOwedToMe,
      netBalance: totalOwedToMe - totalIOwe,
      activeDebtsCount: debts.length,
      iOweCount,
      owedToMeCount,
      currency: 'UZS'
    };
  }

  async updateRemainingAmount(debtId: string, amount: number): Promise<void> {
    await this.debtRepository.update(debtId, { remainingAmount: amount });
  }

  async markAsPaid(debtId: string): Promise<void> {
    await this.debtRepository.update(debtId, {
      status: DebtStatus.PAID,
      remainingAmount: 0
    });
  }

  private mapToEntity(debt: Debt): DebtEntity {
    return {
      id: debt.id,
      userId: debt.userId,
      type: debt.type as DebtType,
      personName: debt.personName,
      originalAmount: Number(debt.originalAmount),
      remainingAmount: Number(debt.remainingAmount),
      currency: debt.currency,
      description: debt.description,
      status: debt.status as DebtStatus,
      dueDate: debt.dueDate,
      createdAt: debt.createdAt,
      updatedAt: debt.updatedAt
    };
  }

  private mapPaymentToEntity(payment: DebtPayment): DebtPaymentEntity {
    return {
      id: payment.id,
      debtId: payment.debtId,
      amount: Number(payment.amount),
      note: payment.note,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt
    };
  }
}
