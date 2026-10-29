import type { ILogger } from '../src/shared/domain/ports/Logger';
import { errorFields, registerLoggerFactory } from '../src/shared/application/logging';
import { ExternalServiceError } from '../src/shared/domain/errors/AppError';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

type LoggingModule = typeof import('../src/shared/application/logging');
type TickerModule = typeof import('../src/modules/notification/application/ticker');

/** A factory that records which category each logger was made for and every line written through it. */
function recordingFactory() {
  const lines: { category: string; level: keyof ILogger; args: unknown[] }[] = [];
  const factory = jest.fn((category: string): ILogger => ({
    debug: (...args) => lines.push({ category, level: 'debug', args }),
    info: (...args) => lines.push({ category, level: 'info', args }),
    warn: (...args) => lines.push({ category, level: 'warn', args }),
    error: (...args) => lines.push({ category, level: 'error', args }),
  }));
  return { factory, lines };
}

/** A fresh copy of the modules, so the registry starts empty as in a new process. */
function freshModules<T>(load: () => T): T {
  let loaded!: T;
  jest.isolateModules(() => {
    loaded = load();
  });
  return loaded;
}

/**
 * FT-165: application files take their logger at import (`const logger = getLogger(…)`), and `src/index.ts`
 * registers the Winston factory only after every import has run. The logger must still write through that factory
 * — with time and level — not through the console fallback it would have been given at import.
 */
describe('application-layer logger (FT-165)', () => {
  it('taken before the factory is registered, writes through the factory registered later', () => {
    const logging = freshModules(() => require('../src/shared/application/logging') as LoggingModule);
    const logger = logging.getLogger('TELEGRAM');
    const { factory, lines } = recordingFactory();

    logging.registerLoggerFactory(factory);
    const failure = new Error('boom');
    logger.debug('d', { a: 1 });
    logger.info('i', { b: 2 });
    logger.warn('w', { c: 3 });
    logger.error('e', failure, { d: 4 });

    expect(factory).toHaveBeenCalledWith('TELEGRAM');
    expect(lines).toEqual([
      { category: 'TELEGRAM', level: 'debug', args: ['d', { a: 1 }] },
      { category: 'TELEGRAM', level: 'info', args: ['i', { b: 2 }] },
      { category: 'TELEGRAM', level: 'warn', args: ['w', { c: 3 }] },
      { category: 'TELEGRAM', level: 'error', args: ['e', failure, { d: 4 }] },
    ]);
  });

  it('an application module imported before the composition root registers the factory logs through it', async () => {
    // The order of src/index.ts: the modules are imported first, the factory is registered after
    const { ticker, logging } = freshModules(() => ({
      ticker: require('../src/modules/notification/application/ticker') as TickerModule,
      logging: require('../src/shared/application/logging') as LoggingModule,
    }));
    const { factory, lines } = recordingFactory();
    logging.registerLoggerFactory(factory);

    const scheduler = new ticker.Ticker('Daily summary');
    const failure = new Error('database is locked');
    await new Promise<void>(resolve => {
      scheduler.start(() => Promise.reject(failure).finally(() => setImmediate(resolve)));
    });
    scheduler.stop();
    await new Promise(resolve => setImmediate(resolve));

    expect(lines).toEqual([{ category: 'TELEGRAM', level: 'error', args: ['Daily summary tick failed', failure] }]);
  });

  it('without a registered factory, falls back to the console logger and does not throw', () => {
    const logging = freshModules(() => require('../src/shared/application/logging') as LoggingModule);

    expect(() => logging.getLogger('USER').warn('no factory yet', { a: 1 })).not.toThrow();
  });
});

/**
 * FT-165 (after FT-145): when the AI fails on a simple «<label> <amount>», the record keeps its label and the log
 * says why — «Request timed out.» that ExternalServiceError keeps in `context`, not only «External service error».
 */
describe('a simple phrase the AI could not read (FT-165)', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('logs the cause behind «External service error: OpenAI Chat»', async () => {
    const { factory, lines } = recordingFactory();
    registerLoggerFactory(factory);
    const records = recordsOn(db.dataSource);
    const openAI = {
      analyzeInput: jest.fn().mockRejectedValue(new ExternalServiceError('OpenAI Chat', new Error('Request timed out.'))),
      transcribe: jest.fn(),
    };
    const learned = { learnedCategoryWords: jest.fn().mockResolvedValue(new Map()) };
    const capture = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog, learned);

    const result = await capture.execute('стрижка 50000', 'user-1');

    expect(result.transactions[0].category).toBe('Другое');
    expect(openAI.analyzeInput).toHaveBeenCalledTimes(1);
    expect(lines).toContainEqual({
      category: 'OPENAI',
      level: 'warn',
      args: [
        'The AI could not read a simple phrase; its label is kept',
        { error: 'External service error: OpenAI Chat', errorContext: { originalError: 'Request timed out.' } },
      ],
    });
  });

  it('a plain error or a thrown value gives its message only', () => {
    expect(errorFields(new Error('401 Incorrect API key'))).toEqual({ error: '401 Incorrect API key' });
    expect(errorFields('socket hang up')).toEqual({ error: 'socket hang up' });
  });
});
