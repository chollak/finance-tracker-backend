import { Writable } from 'stream';
import winston from 'winston';
import { winstonLogger } from '../../src/shared/infrastructure/logging';

export interface LogCapture {
  /**
   * Every line written since the capture began, formatted as the console gets it, without the clock it begins with:
   * «warn [HTTP] Request refused …» of «13:57:21 warn [HTTP] Request refused …».
   */
  lines(): Promise<string[]>;
  /** The console transport, the level and the silence of Jest come back. */
  restore(): void;
}

const CLOCK = /^\d{2}:\d{2}:\d{2} /;

/**
 * The line without its clock (#432). A test that looks for a value a line must not hold — an amount, «50» — found
 * it in the time the line was written at, and was red on the right code whenever the clock showed that number. A line
 * that does not begin with the clock is an error, not a line left as it is: the check would be back unnoticed.
 */
function withoutClock(line: string): string {
  if (!CLOCK.test(line)) throw new Error(`A log line does not begin with its time (HH:mm:ss): ${JSON.stringify(line.slice(0, 40))}`);
  return line.replace(CLOCK, '');
}

/**
 * The lines the Winston logger really writes — after the logger's own redaction and the format (#269), less the time
 * of writing (#432). Jest keeps the logger silent; while capturing it writes every level into memory instead of the
 * console.
 */
export function captureLogLines(): LogCapture {
  const written: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      written.push(String(chunk));
      done();
    },
  });
  const capture = new winston.transports.Stream({ stream });
  const saved = { silent: winstonLogger.silent, level: winstonLogger.level, transports: [...winstonLogger.transports] };

  saved.transports.forEach(transport => winstonLogger.remove(transport));
  winstonLogger.add(capture);
  winstonLogger.silent = false;
  winstonLogger.level = 'debug';

  return {
    async lines() {
      // A line reaches the transport through Winston's streams, a tick after the call
      await new Promise(resolve => setImmediate(resolve));
      return written.map(withoutClock);
    },
    restore() {
      winstonLogger.remove(capture);
      saved.transports.forEach(transport => winstonLogger.add(transport));
      winstonLogger.silent = saved.silent;
      winstonLogger.level = saved.level;
    },
  };
}

/** The level a captured line was written at: `warn` of «warn [HTTP] Request refused …», colours aside. */
export function levelOf(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\u001b\[[0-9;]*m/g, '').split(' ')[0] ?? '';
}
