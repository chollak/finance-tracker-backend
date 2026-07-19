import fs from 'fs';
import os from 'os';
import path from 'path';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';

describe('TransactionLearningService runtime data policy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-policy-'));
    fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads prompt patterns from tracked seed file when runtime patterns file is absent', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'data', 'patterns.seed.json'),
      JSON.stringify({
        categories: [
          { keywords: ['evos'], category: 'restaurants', confidence: 0.8, usageCount: 2 }
        ],
        merchants: []
      })
    );

    const service = new TransactionLearningService(tempDir);

    const enhancedPrompt = await service.getEnhancedPrompts('BASE PROMPT');

    expect(enhancedPrompt).toContain('BASE PROMPT');
    expect(enhancedPrompt).toContain('evos');
    expect(enhancedPrompt).toContain('restaurants');
    expect(fs.existsSync(path.join(tempDir, 'data', 'patterns.json'))).toBe(false);
  });

  it('creates ignored runtime learning files from tracked seed data when recording a correction', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'data', 'learning-data.seed.json'),
      JSON.stringify([
        {
          originalText: 'seed text',
          originalParsing: { amount: 0, category: 'other', type: 'expense', confidence: 0.3 },
          userCorrection: { category: 'restaurants' },
          userId: 'system-seed',
          timestamp: '2026-01-01T00:00:00.000Z',
          confidence: 0.3
        }
      ])
    );
    fs.writeFileSync(
      path.join(tempDir, 'data', 'patterns.seed.json'),
      JSON.stringify({ categories: [], merchants: [] })
    );

    const service = new TransactionLearningService(tempDir);

    await service.recordCorrection(
      'купил в evos',
      { amount: 0, category: 'other', type: 'expense', confidence: 0.3 },
      { category: 'restaurants', merchant: 'Evos' },
      'user-1',
      0.3
    );

    const learningData = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'learning-data.json'), 'utf-8'));
    const patterns = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'patterns.json'), 'utf-8'));

    expect(learningData).toHaveLength(2);
    expect(learningData[0].userId).toBe('system-seed');
    expect(learningData[1].userId).toBe('user-1');
    expect(patterns.categories[0].category).toBe('restaurants');
  });
});
