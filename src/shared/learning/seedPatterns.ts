import { transactionLearning } from './transactionLearning';

/**
 * Create initial seed patterns for better AI performance
 */
export async function createSeedPatterns() {
  try {
    // Add some common Uzbek merchant patterns
    await transactionLearning.recordCorrection(
      'потратил деньги в evos',
      {
        amount: 0,
        category: 'Другое',
        type: 'expense',
        confidence: 0.3
      },
      {
        amount: 35000,
        category: 'Еда',
        merchant: 'Evos'
      },
      'system-seed',
      0.3
    );

    await transactionLearning.recordCorrection(
      'заправился на АЗС',
      {
        amount: 0,
        category: 'Другое',
        type: 'expense',
        confidence: 0.4
      },
      {
        category: 'Транспорт',
        merchant: 'АЗС'
      },
      'system-seed',
      0.4
    );

    await transactionLearning.recordCorrection(
      'такси yandex go',
      {
        amount: 0,
        category: 'Другое',
        type: 'expense',
        confidence: 0.4
      },
      {
        category: 'Транспорт',
        merchant: 'Yandex Go'
      },
      'system-seed',
      0.4
    );

    await transactionLearning.recordCorrection(
      'купил в maxway',
      {
        amount: 0,
        category: 'Другое',
        type: 'expense',
        confidence: 0.3
      },
      {
        category: 'Еда',
        merchant: 'MaxWay'
      },
      'system-seed',
      0.3
    );

    console.log('🌱 LEARNING: Seed patterns created successfully');
  } catch (error) {
    console.error('❌ LEARNING: Failed to create seed patterns:', error);
  }
}