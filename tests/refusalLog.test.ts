import type { ILogger } from '../src/shared/domain/ports/Logger';
import {
  createRefusalLog,
  REFUSAL_LOG_MAX_IDS,
  REFUSAL_LOG_WINDOW_MS,
} from '../src/shared/infrastructure/logging/refusalLog';

/**
 * FT-166: the bot and the API turn away everyone not in ALLOWED_TELEGRAM_IDS (FT-153), and each refusal used to be a
 * `warn` line. Someone who floods the bot would fill journald on the PC. Now the first refusal of an id is written at
 * once — the owner sees who was turned away — and its repeats are counted and written as one line per window.
 */

const MINUTE = 60 * 1000;
const STRANGER = 222;
const OTHER = 333;
const MESSAGE = 'Telegram update from a user who is not allowed ignored';

interface Line {
  at: number;
  message: string;
  context?: Record<string, unknown>;
}

describe('refusals in the log (FT-166)', () => {
  let lines: Line[];
  let logger: ILogger;

  const linesFor = (telegramId: unknown) => lines.filter(line => line.context?.telegramId === telegramId);
  const skippedIn = (some: Line[]) => some.reduce((sum, line) => sum + Number(line.context?.skipped ?? 0), 0);

  beforeEach(() => {
    jest.useFakeTimers();
    lines = [];
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: (message, context) => lines.push({ at: Date.now(), message, context }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the first refusal of an id at once, with what was refused', () => {
    createRefusalLog(logger, MESSAGE).refused(STRANGER, { updateType: 'message' });

    expect(lines).toEqual([{ at: expect.any(Number), message: MESSAGE, context: { telegramId: STRANGER, updateType: 'message' } }]);
  });

  it('counts the repeats within the window and writes how many were skipped when it is over', () => {
    const log = createRefusalLog(logger, MESSAGE);

    for (let i = 0; i < 50; i++) log.refused(STRANGER, { updateType: 'message' });
    expect(lines).toHaveLength(1);

    jest.advanceTimersByTime(REFUSAL_LOG_WINDOW_MS - 1);
    expect(lines).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({
      at: expect.any(Number),
      message: expect.stringContaining(MESSAGE),
      context: { telegramId: STRANGER, skipped: 49, windowMinutes: 10 },
    });
  });

  it('a stranger who keeps writing gets at most one line per window, and every refusal is counted', () => {
    const log = createRefusalLog(logger, MESSAGE);
    let refusals = 0;

    for (let second = 0; second < 35 * 60; second++) {
      log.refused(STRANGER, { updateType: 'message' });
      refusals++;
      jest.advanceTimersByTime(1000);
    }
    jest.advanceTimersByTime(REFUSAL_LOG_WINDOW_MS);

    // The first line at once, then one summary per ten minutes: at 10, 20, 30 and 40
    expect(lines).toHaveLength(5);
    lines.slice(1).forEach((line, i) => expect(line.at - lines[i].at).toBeGreaterThanOrEqual(REFUSAL_LOG_WINDOW_MS));
    expect(1 + skippedIn(lines)).toBe(refusals);
  });

  it('writes nothing more when the repeats stop, and the next refusal after a quiet window at once', () => {
    const log = createRefusalLog(logger, MESSAGE);
    log.refused(STRANGER);
    log.refused(STRANGER);
    jest.advanceTimersByTime(REFUSAL_LOG_WINDOW_MS);
    expect(lines).toHaveLength(2);

    jest.advanceTimersByTime(5 * REFUSAL_LOG_WINDOW_MS);
    expect(lines).toHaveLength(2);

    log.refused(STRANGER, { updateType: 'callback_query' });
    expect(lines).toHaveLength(3);
    expect(lines[2].context).toEqual({ telegramId: STRANGER, updateType: 'callback_query' });
  });

  it('does not write a summary for a window with a single refusal', () => {
    createRefusalLog(logger, MESSAGE).refused(STRANGER);

    jest.advanceTimersByTime(3 * REFUSAL_LOG_WINDOW_MS);

    expect(lines).toHaveLength(1);
  });

  it('writes a new id at once while another one floods', () => {
    const log = createRefusalLog(logger, MESSAGE);
    for (let i = 0; i < 10; i++) log.refused(STRANGER);
    jest.advanceTimersByTime(MINUTE);

    log.refused(OTHER, { path: '/api/settings' });

    expect(linesFor(STRANGER)).toHaveLength(1);
    expect(linesFor(OTHER)).toEqual([{ at: expect.any(Number), message: MESSAGE, context: { telegramId: OTHER, path: '/api/settings' } }]);
  });

  it('counts an id given as a number or as a string as one, and refusals that name no id as one more', () => {
    const log = createRefusalLog(logger, MESSAGE);
    log.refused(STRANGER);
    log.refused(String(STRANGER));
    log.refused(undefined, { updateType: 'channel_post' });
    log.refused(undefined, { updateType: 'channel_post' });
    log.refused(null);

    expect(lines.map(line => line.context?.telegramId)).toEqual([STRANGER, undefined]);

    jest.advanceTimersByTime(REFUSAL_LOG_WINDOW_MS);
    expect(skippedIn(lines)).toBe(3);
  });

  it('remembers a bounded number of ids: the one refused longest ago is forgotten, its count written first', () => {
    const log = createRefusalLog(logger, MESSAGE, { maxIds: 2 });
    log.refused(1);
    log.refused(1);
    log.refused(1);
    log.refused(2);

    // 1 is the oldest and has two skipped: forgetting it writes them before the new id
    log.refused(3);
    // 2 is still remembered: its repeat is counted, not written, and makes it the newest
    log.refused(2);
    // 1 was forgotten, so it is new again; 3 is the oldest now and goes without a line, nothing was skipped
    log.refused(1);
    jest.advanceTimersByTime(REFUSAL_LOG_WINDOW_MS);

    expect(lines.map(line => line.context)).toEqual([
      { telegramId: 1 },
      { telegramId: 2 },
      { telegramId: 1, skipped: 2, windowMinutes: 10 },
      { telegramId: 3 },
      { telegramId: 1 },
      { telegramId: 2, skipped: 1, windowMinutes: 10 },
    ]);
  });

  it('a stream of different ids keeps at most the bound in memory', () => {
    const log = createRefusalLog(logger, MESSAGE, { maxIds: 100 });
    for (let id = 1; id <= 10_000; id++) log.refused(id);

    // Every new id is written once; the first ones were forgotten, so they are written again as new
    expect(lines).toHaveLength(10_000);
    log.refused(1);
    expect(lines).toHaveLength(10_001);
    log.refused(10_000);
    expect(lines).toHaveLength(10_001);
  });

  it('defaults to a ten-minute window and a thousand ids', () => {
    expect(REFUSAL_LOG_WINDOW_MS).toBe(10 * MINUTE);
    expect(REFUSAL_LOG_MAX_IDS).toBe(1000);
  });
});
