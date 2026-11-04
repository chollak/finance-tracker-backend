import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

const DOWNLOAD_TIMEOUT = 30000; // 30 seconds

/**
 * Downloads a file from URL to local filesystem.
 *
 * The URL is never logged (#269): Telegraf's file link is `https://api.telegram.org/file/bot<TOKEN>/<path>`, so it
 * carries the bot token. A failure logs `dest` — its name holds the Telegram `file_id` — and the reason.
 * @param url - URL to download from
 * @param dest - Destination file path
 * @returns Promise resolving to the destination path
 */
export async function downloadFile(url: string, dest: string): Promise<string> {
  try {
    const dir = path.dirname(dest);
    await fs.promises.mkdir(dir, { recursive: true });

    const file = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      const handleError = async (err: Error) => {
        logger.error('Download error', err, { dest });

        try {
          if (!file.destroyed) {
            file.destroy();
          }
          await fs.promises.unlink(dest).catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
        reject(ErrorFactory.externalService('File Download', err));
      };

      file.on('error', handleError);

      const client = url.startsWith('https:') ? https : http;

      const request = client.get(url, async response => {
        try {
          if (response.statusCode !== 200) {
            throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
          }

          await pipeline(response, file);
          resolve(dest);
        } catch (err) {
          handleError(err as Error);
        }
      }).on('error', handleError);

      request.setTimeout(DOWNLOAD_TIMEOUT, () => {
        request.destroy();
        handleError(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT / 1000} seconds`));
      });
    });
  } catch (error) {
    logger.error('Download setup error', error instanceof Error ? error : new Error(String(error)), { dest });
    throw ErrorFactory.externalService('File Download Setup', error instanceof Error ? error : undefined);
  }
}

/**
 * Gets the downloads directory path
 * Creates directory if it doesn't exist
 */
export function getDownloadsDir(): string {
  const dir = path.resolve(AppConfig.DOWNLOADS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Gets the temp directory path for fallback
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * A name of its own for every download. One voice forwarded twice is two messages with one `file_id`, handled side by
 * side; with the `file_id` alone for a name they shared a file, and the first, done, removed the second's (FT-222).
 * The `file_id` stays in the name to match a stray file with the log.
 */
function voiceFileName(fileId: string): string {
  return `${fileId}-${randomUUID()}`;
}

/**
 * Downloads a voice file with fallback to temp directory
 * @param fileUrl - URL of the voice file
 * @param fileId - Telegram file ID for naming
 * @returns Promise resolving to the local file path, a new one on every call
 */
export async function downloadVoiceFile(fileUrl: string, fileId: string): Promise<string> {
  const name = voiceFileName(fileId);
  // Try primary downloads directory
  try {
    const downloadsDir = getDownloadsDir();
    const filePath = path.join(downloadsDir, name);
    await downloadFile(fileUrl, filePath);
    return filePath;
  } catch (primaryError) {
    logger.warn('Cannot write to downloads directory, using temp directory', {
      error: primaryError instanceof Error ? primaryError.message : String(primaryError)
    });

    // Fallback to temp directory
    const filePath = path.join(getTempDir(), `voice_${name}`);
    await downloadFile(fileUrl, filePath);
    return filePath;
  }
}

/**
 * Safely removes a file, ignoring errors if file doesn't exist
 * @param filePath - Path to file to remove
 */
export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Silently ignore cleanup errors
  }
}
