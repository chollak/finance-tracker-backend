import type { ILogger } from '../src/shared/domain/ports/Logger';

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
