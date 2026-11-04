import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTextMessageHandler } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { registerLoggerFactory } from '../src/shared/application/logging';
import { createLogger } from '../src/shared/infrastructure/logging';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { captureLogLines, LogCapture } from './helpers/logLines';

/**
 * #269: what the user wrote or said — the phrase, what was heard, the amount, the note, the merchant — stays out of
 * the log, as quick capture already does («only counts and routing metadata are logged»). The lines that failed or
 * found nothing say how long the text was and which parts a record had, not the parts themselves.
 *
 * The real Winston logger writes into memory; application files log through it, as in `src/index.ts`.
 */

// ffmpeg is faked: it copies the voice to the `.mp3`, so the voice path reaches transcription
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  const { EventEmitter } = jest.requireActual('events');
  const files = jest.requireActual('fs');
  return {
    ...actual,
    spawn: jest.fn((_command: string, args: string[]) => {
      const ffmpeg = new EventEmitter();
      setImmediate(() => {
        files.copyFileSync(args[args.indexOf('-i') + 1], args[args.length - 1]);
        ffmpeg.emit('close', 0, null);
      });
      return ffmpeg;
    }),
  };
});

const PHRASE = 'кофе у Алишера 47000 в Korzinka';
/** Pieces of the phrase and of the record that must not be in any line. */
const PRIVATE = ['Алишер', 'Korzinka', '47000', '47 000', 'кофе'];

const PARSED = {
  transactions: [{
    intent: 'transaction' as const,
    amount: 47000,
    category: 'Кафе',
    type: 'expense' as const,
    date: '2026-11-04',
    merchant: 'Korzinka',
    description: 'кофе у Алишера',
    confidence: 0.9,
  }],
  debts: [],
};

function parserOf(heard: string, parsed: unknown = PARSED) {
  return {
    transcribe: jest.fn().mockResolvedValue(heard),
    analyzeInput: jest.fn().mockResolvedValue(parsed),
    analyzeTransactions: jest.fn(),
  };
}

function failingCreate() {
  return { execute: jest.fn().mockRejectedValue(new Error('database is locked')) } as unknown as CreateTransactionUseCase;
}

function expectNothingPrivate(lines: string[]): void {
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    for (const piece of PRIVATE) {
      expect(line).not.toContain(piece);
    }
  }
}

function lineWith(lines: string[], message: string): string {
  const line = lines.find(candidate => candidate.includes(message));
  if (!line) throw new Error(`No line «${message}» in:\n${lines.join('')}`);
  return line;
}

describe('the log keeps counts and signs, not what the user wrote (#269)', () => {
  let capture: LogCapture;
  let dir: string;

  beforeEach(() => {
    registerLoggerFactory(createLogger);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), '269-capture-'));
    capture = captureLogLines();
  });

  afterEach(() => {
    capture.restore();
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function voiceFile(): string {
    const file = path.join(dir, 'voice-269');
    fs.writeFileSync(file, 'OggS voice');
    return file;
  }

  it('a phrase the bot failed on: its length, not its words', async () => {
    const reply = jest.fn().mockResolvedValue({ message_id: 1 });
    const ctx = {
      message: { text: PHRASE },
      from: { id: 131184740, first_name: 'Shukur' },
      chat: { id: 131184740 },
      session: {},
      reply,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      modules: {
        quickCaptureModule: {
          getQuickCaptureService: () => ({ capture: jest.fn().mockRejectedValue(new Error('database is locked')) }),
        },
      },
    };

    await createTextMessageHandler()(ctx as any);

    const lines = await capture.lines();
    expectNothingPrivate(lines);
    expect(lineWith(lines, 'Text message error')).toContain(`"textLength":${PHRASE.length}`);
    // The user is still told, as before
    expect(reply).toHaveBeenCalled();
  });

  it('a phrase whose record was not written: the signs of the record, not its amount, note or merchant', async () => {
    const text = new ProcessTextInputUseCase(parserOf('', PARSED) as unknown as TranscriptionService, failingCreate());

    const result = await text.execute(PHRASE, 'user-1', 'Shukur');

    expect(result.transactions).toEqual([]);
    const lines = await capture.lines();
    expectNothingPrivate(lines);
    const failed = lineWith(lines, 'Failed to create transaction from text input');
    expect(failed).toContain('database is locked');
    expect(failed).toContain('"hasAmount":true');
  });

  it('a voice with nothing to write: the length of what was heard, not the words', async () => {
    const heard = 'привет Алишер, как дела в Korzinka';
    const voice = new ProcessVoiceInputUseCase(
      parserOf(heard, { transactions: [], debts: [] }) as unknown as TranscriptionService,
      failingCreate()
    );

    await voice.execute({ filePath: voiceFile(), userId: 'user-1', source: 'telegram' });

    const lines = await capture.lines();
    expectNothingPrivate(lines);
    expect(lineWith(lines, 'No transactions or debts found in voice input')).toContain(`"textLength":${heard.length}`);
  });

  it('a voice whose record was not written: the signs of the record, not its amount, note or merchant', async () => {
    const voice = new ProcessVoiceInputUseCase(parserOf(PHRASE) as unknown as TranscriptionService, failingCreate());

    const result = await voice.execute({ filePath: voiceFile(), userId: 'user-1', source: 'telegram' });

    expect(result.transactions).toEqual([]);
    const lines = await capture.lines();
    expectNothingPrivate(lines);
    const failed = lineWith(lines, 'Failed to create transaction from voice input');
    expect(failed).toContain('"hasMerchant":true');
    expect(failed).toContain('"hasNote":true');
  });

  it('an AI answer that is not JSON: its length, not the answer, which repeats the phrase', async () => {
    const service = new OpenAITranscriptionService('test-api-key') as unknown as { parseAnalysisResponse(content: string): unknown };
    const answer = 'Кофе у Алишера 47000 в Korzinka — это расход';

    expect(() => service.parseAnalysisResponse(answer)).toThrow('OpenAI Response Parser');

    const lines = await capture.lines();
    // V8 quotes the start of the input in its JSON error: «Unexpected token 'К', "Кофе у Али"...»
    for (const line of lines) {
      expect(line).not.toContain('Кофе');
    }
    expectNothingPrivate(lines);
    expect(lineWith(lines, 'Failed to parse OpenAI response')).toContain(`"contentLength":${answer.length}`);
  });

  it('an AI answer broken at a position: the position stays, as it quotes nothing', async () => {
    const service = new OpenAITranscriptionService('test-api-key') as unknown as { parseAnalysisResponse(content: string): unknown };

    expect(() => service.parseAnalysisResponse('{"items": [{"description": "кофе у Алишера" "amount": 47000}]}')).toThrow();

    const lines = await capture.lines();
    expectNothingPrivate(lines);
    expect(lineWith(lines, 'Failed to parse OpenAI response')).toMatch(/at position \d+/);
  });

  it('an AI answer that is not JSON: the error it is thrown with does not carry the answer either', () => {
    const service = new OpenAITranscriptionService('test-api-key') as unknown as { parseAnalysisResponse(content: string): unknown };

    let thrown: unknown;
    try {
      service.parseAnalysisResponse('Кофе у Алишера 47000');
    } catch (error) {
      thrown = error;
    }

    const originalError = String((thrown as { context?: { originalError?: string } }).context?.originalError);
    expect(originalError).toMatch(/^Invalid JSON response/);
    expect(originalError).not.toContain('Кофе');
  });

  it('a learned correction: which fields changed, not the phrase or the new values', async () => {
    const learning = new TransactionLearningService(dir);

    await learning.recordCorrection(PHRASE, { amount: 47000, merchant: 'Korzinka' }, { amount: 52000, merchant: 'Makro' }, 'user-1234567890', 0.9);

    const lines = await capture.lines();
    expectNothingPrivate(lines);
    const recorded = lineWith(lines, 'Learning data recorded successfully');
    expect(recorded).not.toContain('52000');
    expect(recorded).not.toContain('Makro');
    expect(recorded).toContain('"corrections":["amount","merchant"]');
    expect(recorded).toContain(`"textLength":${PHRASE.length}`);
  });

  it('a correction that could not be learned: the length of the phrase, not its words', async () => {
    const learning = new TransactionLearningService(dir);
    jest.spyOn(learning as unknown as { updatePatterns(): Promise<void> }, 'updatePatterns').mockRejectedValue(new Error('disk full'));

    await learning.recordCorrection(PHRASE, {}, { category: 'cafe' }, 'user-1234567890', 0.9);

    const lines = await capture.lines();
    expectNothingPrivate(lines);
    expect(lineWith(lines, 'Failed to record learning data')).toContain(`"textLength":${PHRASE.length}`);
  });
});
