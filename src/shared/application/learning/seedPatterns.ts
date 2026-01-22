import { transactionLearning } from './transactionLearning';
import { createLogger, LogCategory } from '../../infrastructure/logging';

const logger = createLogger(LogCategory.LEARNING);

/**
 * Create initial seed patterns for better AI performance
 */
export async function createSeedPatterns() {
  try {
    // Add some common Uzbek merchant patterns (using category IDs)
    await transactionLearning.recordCorrection(
      'потратил деньги в evos',
      {
        amount: 0,
        category: 'other',
        type: 'expense',
        confidence: 0.3
      },
      {
        amount: 35000,
        category: 'food',
        merchant: 'Evos'
      },
      'system-seed',
      0.3
    );

    await transactionLearning.recordCorrection(
      'заправился на АЗС',
      {
        amount: 0,
        category: 'other',
        type: 'expense',
        confidence: 0.4
      },
      {
        category: 'fuel',
        merchant: 'АЗС'
      },
      'system-seed',
      0.4
    );

    await transactionLearning.recordCorrection(
      'такси yandex go',
      {
        amount: 0,
        category: 'other',
        type: 'expense',
        confidence: 0.4
      },
      {
        category: 'taxi',
        merchant: 'Yandex Go'
      },
      'system-seed',
      0.4
    );

    await transactionLearning.recordCorrection(
      'купил в maxway',
      {
        amount: 0,
        category: 'other',
        type: 'expense',
        confidence: 0.3
      },
      {
        category: 'food',
        merchant: 'MaxWay'
      },
      'system-seed',
      0.3
    );

    logger.info('Seed patterns created successfully');
  } catch (error) {
    logger.error('Failed to create seed patterns', error as Error);
  }
}