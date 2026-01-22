import { ProcessedTransaction, DetectedTransaction, DetectedDebt } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.OPENAI);

export class ProcessTextInputUseCase {
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    private createDebtUseCase?: CreateDebtUseCase
  ) {}

  async execute(text: string, userId: string, userName?: string): Promise<ProcessedTransaction> {
    // Use new analyzeInput method that returns both transactions and debts
    const parsed = await this.openAIService.analyzeInput(text);

    const transactionResults: DetectedTransaction[] = [];
    const debtResults: DetectedDebt[] = [];

    // Process transactions
    for (const p of parsed.transactions) {
      try {
        const transaction: Transaction = {
          date: p.date || new Date().toISOString().split('T')[0],
          category: p.category || 'other',
          description: p.description || text,
          amount: p.amount || 0,
          type: p.type || 'expense',
          userId,
          userName,
          merchant: p.merchant,
          confidence: p.confidence,
          originalText: text,
          originalParsing: {
            amount: p.amount || 0,
            category: p.category || 'other',
            type: p.type || 'expense',
            merchant: p.merchant,
            confidence: p.confidence,
          },
        };

        const createResult = await this.createTransactionUseCase.execute(transaction);
        if (createResult.success) {
          transactionResults.push({
            id: createResult.data,
            amount: transaction.amount,
            category: transaction.category,
            type: transaction.type,
            date: transaction.date,
            merchant: transaction.merchant,
            confidence: transaction.confidence,
            description: transaction.description,
          });
        } else {
          logger.error('Failed to create transaction', null, { error: createResult.error?.message });
        }
      } catch (error) {
        logger.error('Failed to create transaction from text input', error as Error, {
          transactionData: p,
          userId,
        });
      }
    }

    // Process debts (if DebtModule is available)
    if (this.createDebtUseCase && parsed.debts.length > 0) {
      for (const d of parsed.debts) {
        try {
          const debtType = d.debtType === 'i_owe' ? DebtType.I_OWE : DebtType.OWED_TO_ME;

          const result = await this.createDebtUseCase.execute({
            userId,
            type: debtType,
            personName: d.personName,
            amount: d.amount,
            description: d.description || text,
            dueDate: d.dueDate || undefined,
            moneyTransferred: d.moneyTransferred,
          });

          // Check if result was successful
          if (result.success) {
            debtResults.push({
              id: result.data.id!,
              debtType: d.debtType,
              personName: d.personName,
              amount: d.amount,
              dueDate: d.dueDate,
              description: d.description,
              confidence: d.confidence,
              // Transaction is created internally, we get the debt back
              linkedTransactionId: d.moneyTransferred ? result.data.id : undefined,
            });
          } else {
            // Re-throw DebtLimitExceededError to show user-friendly message
            if (result.error instanceof DebtLimitExceededError) {
              throw result.error;
            }
            logger.error('Failed to create debt', null, { error: result.error.message });
          }
        } catch (error) {
          // Re-throw DebtLimitExceededError to show user-friendly message
          if (error instanceof DebtLimitExceededError) {
            throw error;
          }
          logger.error('Failed to create debt from text input', error as Error, {
            debtData: d,
            userId,
          });
        }
      }
    }

    return { text, transactions: transactionResults, debts: debtResults };
  }
}
