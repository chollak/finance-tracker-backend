/**
 * source — единственное действительно новое поле из спеки: originalText,
 * confidence, originalParsing, needsReview, merchant и semanticType в Transaction
 * уже были. Нужно, чтобы отличать каналы захвата, когда рядом с Telegram появится
 * Apple Shortcut, а позже, возможно, нативное приложение.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

function capturingCreateUseCase(saved: Transaction[]) {
  return {
    execute: jest.fn(async (tx: Transaction) => {
      saved.push(tx);
      return { success: true, data: 'tx-1' };
    }),
  };
}

describe('канал захвата в поле source', () => {
  it('проставляется из вызывающего клиента', async () => {
    const saved: Transaction[] = [];
    const useCase = new ProcessTextInputUseCase(
      { analyzeInput: jest.fn() } as never,
      capturingCreateUseCase(saved) as never
    );

    await useCase.execute('такси 18000', 'user-1', 'Тест', 'shortcut');

    expect(saved).toHaveLength(1);
    expect(saved[0].source).toBe('shortcut');
  });

  it('по умолчанию telegram — исторически единственный канал', async () => {
    const saved: Transaction[] = [];
    const useCase = new ProcessTextInputUseCase(
      { analyzeInput: jest.fn() } as never,
      capturingCreateUseCase(saved) as never
    );

    await useCase.execute('такси 18000', 'user-1', 'Тест');

    expect(saved[0].source).toBe('telegram');
  });

  it('веб-приложение отличимо от бота', async () => {
    const saved: Transaction[] = [];
    const useCase = new ProcessTextInputUseCase(
      { analyzeInput: jest.fn() } as never,
      capturingCreateUseCase(saved) as never
    );

    await useCase.execute('кофе 25000', 'user-1', 'Тест', 'webapp');

    expect(saved[0].source).toBe('webapp');
  });

  it('голосовой путь тоже помечает канал', async () => {
    const saved: Transaction[] = [];
    const transcription = {
      transcribe: jest.fn(async () => 'такси 18000'),
      analyzeInput: jest.fn(async () => ({
        transactions: [
          {
            intent: 'transaction',
            amount: 18000,
            category: 'taxi',
            type: 'expense',
            semanticType: 'expense',
            needsReview: false,
            date: '2026-08-27',
            confidence: 0.9,
            description: 'такси',
          },
        ],
        debts: [],
      })),
    };

    const useCase = new ProcessVoiceInputUseCase(
      transcription as never,
      capturingCreateUseCase(saved) as never
    );

    // Use case проверяет файл на диске, поэтому нужен настоящий. Конвертация
    // ffmpeg на нём не сработает и путь уйдёт в запасное переименование —
    // для проверки канала захвата этого достаточно.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-voice-'));
    const filePath = path.join(dir, 'voice.ogg');
    fs.writeFileSync(filePath, 'не настоящее аудио');

    try {
      await useCase.execute({ filePath, userId: 'user-1', userName: 'Тест' } as never);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    expect(saved).toHaveLength(1);
    expect(saved[0].source).toBe('telegram');
  });
});
