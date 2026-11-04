import { Writable } from 'stream';
import winston from 'winston';
import { winstonLogger } from '../../src/shared/infrastructure/logging';

export interface LogCapture {
  /** Every line written since the capture began, formatted as the console gets it. */
  lines(): Promise<string[]>;
  /** The console transport, the level and the silence of Jest come back. */
  restore(): void;
}

/**
 * The lines the Winston logger really writes — after the logger's own redaction and the format (#269). Jest keeps the
 * logger silent; while capturing it writes every level into memory instead of the console.
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
      return [...written];
    },
    restore() {
      winstonLogger.remove(capture);
      saved.transports.forEach(transport => winstonLogger.add(transport));
      winstonLogger.silent = saved.silent;
      winstonLogger.level = saved.level;
    },
  };
}
