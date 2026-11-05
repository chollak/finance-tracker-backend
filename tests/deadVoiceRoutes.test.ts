import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #221: the web voice routes `/api/voice/*` had no client left. The webapp's only caller was the voice check page
 * removed in #207; the bot takes a voice from Telegram itself (`ProcessVoiceInputUseCase`), the iOS app hears speech on
 * the phone and sends text to `/api/quick-capture`, and no client called `text-input`. They are gone with their
 * multer upload into `uploads/`; the bot's voice path stays (`voiceUploadCleanup.test.ts`).
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const USER_ID = '131184740';

describe('the web voice routes are gone (#221)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  /** A request as a signed-in client would send it, so a route that is still there would answer it, not refuse it. */
  async function post(path: string, body: string | FormData, contentType?: string) {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'X-Dev-User-Id': USER_ID, ...(contentType ? { 'Content-Type': contentType } : {}) },
      body,
    });
    return { status: res.status, body: await res.json() };
  }

  it('POST /api/voice/text-input is not a route', async () => {
    const res = await post('/api/voice/text-input', JSON.stringify({ userId: USER_ID, text: 'кофе 25 тысяч' }), 'application/json');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('POST /api/voice/voice-input is not a route', async () => {
    const form = new FormData();
    form.append('userId', USER_ID);
    form.append('audio', new Blob(['wav'], { type: 'audio/wav' }), 'voice.wav');

    const res = await post('/api/voice/voice-input', form);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
