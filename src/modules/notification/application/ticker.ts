import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TELEGRAM);

/** How often the schedulers of the bot's notices look at the clock. */
export const SUMMARY_TICK_MS = 60_000;

export interface SchedulerOptions {
  /** How often the clock is looked at. */
  everyMs?: number;
  /** The first look this long after the start; at once by default. */
  firstTickInMs?: number;
}

/**
 * Runs a look at the clock now (or `firstTickInMs` later) and then every SUMMARY_TICK_MS, one at a time: a slow one is
 * not overlapped by the next, a failed one does not stop the next ones. Shared by the daily summary (FT-124) and the
 * reminders (FT-133).
 */
export class Ticker {
  private timer?: NodeJS.Timeout;
  private firstTick?: NodeJS.Timeout;
  private running = false;

  constructor(private name: string) {}

  start(tick: () => Promise<unknown>, options: SchedulerOptions = {}): void {
    if (this.timer || this.firstTick) return;
    const everyMs = options.everyMs ?? SUMMARY_TICK_MS;
    const run = () => {
      if (this.running) return;
      this.running = true;
      tick()
        .catch(error => logger.error(`${this.name} tick failed`, error as Error))
        .finally(() => {
          this.running = false;
        });
    };
    const begin = () => {
      this.firstTick = undefined;
      run();
      this.timer = setInterval(run, everyMs);
      this.timer.unref?.();
    };
    if (!options.firstTickInMs) return begin();
    this.firstTick = setTimeout(begin, options.firstTickInMs);
    this.firstTick.unref?.();
  }

  /** No more ticks; a tick already running finishes. `start` again resumes. */
  stop(): void {
    if (this.firstTick) clearTimeout(this.firstTick);
    if (this.timer) clearInterval(this.timer);
    this.firstTick = undefined;
    this.timer = undefined;
  }
}
