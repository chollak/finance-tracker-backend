import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

/**
 * FT-216: a voice is converted to `<file>.mp3` next to the file the bot downloaded, or — when ffmpeg fails — that file is
 * renamed to it. Afterwards neither may stay: on the live instance a stray file in `downloads/` makes the working tree
 * dirty, and `scripts/live-update.sh` refuses to update. Real files in a temporary folder; ffmpeg is faked: it writes
 * the `.mp3`, or it is not there at all. The web upload `POST /api/voice/voice-input` and its `uploads/` are gone (#221).
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

  describe('a voice the bot downloaded', () => {
    it('converted by ffmpeg and read: neither the voice nor its .mp3 stays', async () => {
      const file = downloaded();

      await voice.execute({ filePath: file, userId: 'user-1', source: 'telegram' });

      expect(transcribe).toHaveBeenCalledWith(`${file}.mp3`);
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('without ffmpeg: the .mp3 it was renamed to does not stay', async () => {
      mockFfmpeg.missing = true;
      const file = downloaded();

      await voice.execute({ filePath: file, userId: 'user-1', source: 'telegram' });

      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('converted, then the transcription fails: neither file stays', async () => {
      transcribe.mockRejectedValue(new Error('OpenAI is down'));
      const file = downloaded();

      await expect(voice.execute({ filePath: file, userId: 'user-1', source: 'telegram' })).rejects.toThrow();

      expect(fs.readdirSync(dir)).toEqual([]);
    });
  });
});
