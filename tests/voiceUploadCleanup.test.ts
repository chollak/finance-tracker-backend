import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { createVoiceProcessingRouter } from '../src/modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * FT-216: a voice is converted to `<file>.mp3` next to its upload, or — when ffmpeg fails — the upload is renamed to it.
 * Afterwards neither may stay: on the live instance a stray file in `uploads/` or `downloads/` makes the working tree
 * dirty, and `scripts/live-update.sh` refuses to update. Real files in a temporary folder; ffmpeg is faked: it writes
 * the `.mp3`, or it is not there at all.
 */

const mockFfmpeg = { missing: false };
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  const { EventEmitter } = jest.requireActual('events');
  const files = jest.requireActual('fs');
  return {
    ...actual,
    spawn: jest.fn((_command: string, args: string[]) => {
      const ffmpeg = new EventEmitter();
      setImmediate(() => {
        if (mockFfmpeg.missing) {
          ffmpeg.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
          return;
        }
        files.writeFileSync(args[args.length - 1], 'mp3');
        ffmpeg.emit('close', 0, null);
      });
      return ffmpeg;
    }),
  };
});

describe('a voice leaves no files behind (FT-216)', () => {
  let dir: string;
  let transcribe: jest.Mock;
  let voice: ProcessVoiceInputUseCase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batchB-ft216-'));
    mockFfmpeg.missing = false;
    transcribe = jest.fn().mockResolvedValue('привет');
    const parser = {
      transcribe,
      analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;
    voice = new ProcessVoiceInputUseCase(parser, { execute: jest.fn() } as unknown as CreateTransactionUseCase);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A voice the bot downloaded into its folder. */
  function downloaded(): string {
    const file = path.join(dir, 'voice-12.ogg');
    fs.writeFileSync(file, 'ogg');
    return file;
  }

  describe('through POST /api/voice/voice-input', () => {
    let api: LoopbackServer;
    let uploads: string;

    beforeEach(async () => {
      uploads = path.join(dir, 'uploads');
      const app = express();
      app.use('/api/voice', createVoiceProcessingRouter(voice, {} as ProcessTextInputUseCase, undefined, { uploadDir: uploads }));
      app.use(errorHandler);
      api = await listenOnLoopback(app);
    });

    afterEach(() => api.close());

    async function send(audio: string): Promise<number> {
      const form = new FormData();
      form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'voice.wav');
      const response = await fetch(`${api.baseUrl}/api/voice/voice-input`, {
        method: 'POST',
        headers: { 'X-Dev-User-Id': '131184740' },
        body: form,
      });
      return response.status;
    }

    it('converted by ffmpeg: neither the upload nor its .mp3 stays', async () => {
      expect(await send('wav')).toBe(200);
      expect(transcribe).toHaveBeenCalledWith(expect.stringMatching(/\.mp3$/));
      expect(fs.readdirSync(uploads)).toEqual([]);
    });

    it('without ffmpeg, the upload renamed to .mp3: nothing stays', async () => {
      mockFfmpeg.missing = true;
      expect(await send('wav')).toBe(200);
      expect(fs.readdirSync(uploads)).toEqual([]);
    });

    it('an empty upload, refused before the voice is read: nothing stays', async () => {
      expect(await send('')).toBe(400);
      expect(fs.readdirSync(uploads)).toEqual([]);
    });
  });

  describe('a voice the bot downloaded', () => {
    it('without ffmpeg: the .mp3 it was renamed to does not stay', async () => {
      mockFfmpeg.missing = true;
      const file = downloaded();

      await voice.execute({ filePath: file, userId: 'user-1' });

      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('converted, then the transcription fails: neither file stays', async () => {
      transcribe.mockRejectedValue(new Error('OpenAI is down'));
      const file = downloaded();

      await expect(voice.execute({ filePath: file, userId: 'user-1' })).rejects.toThrow();

      expect(fs.readdirSync(dir)).toEqual([]);
    });
  });
});
