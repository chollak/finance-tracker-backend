import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { downloadFile, downloadVoiceFile } from '../src/delivery/messaging/telegram/utils/fileDownloader';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';
import { captureLogLines, LogCapture } from './helpers/logLines';

/**
 * #269: Telegraf gives the voice link as `…/file/bot<TOKEN>/<path>`, and a failed download logged its first 100
 * characters — the whole token. Real downloads from a server on 127.0.0.1, with a fake token in the link: whatever
 * fails, no line of the log carries the link, and the file id and the reason are still there.
 */
const BOT_SECRET = ['ABC-DEF1234ghIkl', 'zyx57W2v1u123ew11'].join('-');
const FILE_ID = 'AwACAgIAAxkBAAIBVoice-269';

function linkOn(baseUrl: string): string {
  return `${baseUrl}/file/bot123456:${BOT_SECRET}/voice/file_7.oga`;
}

/** A port nothing listens on: taken from a server that is closed again. */
async function closedPort(): Promise<string> {
  const server = await listenOnLoopback((_req, res) => res.end());
  await server.close();
  return server.baseUrl;
}

describe('a failed voice download does not log the link with the bot token (#269)', () => {
  let downloads: string;
  let telegramFiles: LoopbackServer | undefined;
  let capture: LogCapture;

  beforeEach(() => {
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), '269-downloads-'));
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', downloads);
    capture = captureLogLines();
  });

  afterEach(async () => {
    capture.restore();
    jest.restoreAllMocks();
    await telegramFiles?.close();
    telegramFiles = undefined;
    fs.rmSync(downloads, { recursive: true, force: true });
  });

  /** Every line: no token, no link at all. */
  function expectNoLink(lines: string[]): void {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(BOT_SECRET);
      expect(line).not.toContain('/file/bot');
    }
  }

  it('when Telegram answers with an error', async () => {
    telegramFiles = await listenOnLoopback((_req, res) => {
      res.statusCode = 500;
      res.end('Internal Server Error');
    });

    await expect(downloadVoiceFile(linkOn(telegramFiles.baseUrl), FILE_ID)).rejects.toThrow('File Download');

    const lines = await capture.lines();
    expectNoLink(lines);
    const failures = lines.filter(line => line.includes('Download error'));
    // The downloads folder, then the temporary one
    expect(failures).toHaveLength(2);
    for (const line of failures) {
      expect(line).toContain(FILE_ID);
      expect(line).toContain('HTTP 500');
    }
  });

  it('when the connection fails', async () => {
    await expect(downloadVoiceFile(linkOn(await closedPort()), FILE_ID)).rejects.toThrow('File Download');

    const lines = await capture.lines();
    expectNoLink(lines);
    expect(lines.filter(line => line.includes('Download error')).every(line => line.includes('ECONNREFUSED'))).toBe(true);
  });

  it('when the file cannot be put where it should go', async () => {
    telegramFiles = await listenOnLoopback((_req, res) => res.end('OggS voice'));
    // A file where the folder should be
    const blocker = path.join(downloads, 'not-a-folder');
    fs.writeFileSync(blocker, '');

    await expect(downloadFile(linkOn(telegramFiles.baseUrl), path.join(blocker, FILE_ID))).rejects.toThrow('File Download Setup');

    const lines = await capture.lines();
    expectNoLink(lines);
    expect(lines.some(line => line.includes('Download setup error') && line.includes(FILE_ID))).toBe(true);
  });
});
