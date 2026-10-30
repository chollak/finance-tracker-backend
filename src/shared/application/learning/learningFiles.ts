import fs from 'fs/promises';
import path from 'path';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.LEARNING);

/**
 * Reads a learning file: undefined when there is none or it is not JSON. A broken file is an error in the log; when
 * the read is for a change (`keepIfBroken`), the file is first copied beside itself as `<name>.corrupt-<time>`, so the
 * write that follows does not lose its history silently (FT-184).
 */
export async function readLearningFile(file: string, keepIfBroken = false): Promise<unknown> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf-8');
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const kept = keepIfBroken ? await keepBroken(file) : undefined;
    logger.error('A learning file is not JSON; it is read as empty', error as Error, { file, kept });
    return undefined;
  }
}

async function keepBroken(file: string): Promise<string | undefined> {
  const kept = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    await fs.copyFile(file, kept);
    return kept;
  } catch (error) {
    logger.error('Failed to keep a broken learning file', error as Error, { file });
    return undefined;
  }
}

/**
 * Replaces a learning file in one step (FT-184): written beside it and renamed over it, so a reader never gets half a
 * file — which it would take for no file and fall back to the seed.
 */
export async function writeLearningFile(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2));
  await fs.rename(temporary, file);
}
