import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { createHealthHandler } from '../src/delivery/web/express/routes/healthRoutes';
import { TelegramBotRuntimeState } from '../src/delivery/messaging/telegram/telegramBot';

/**
 * FT-154: `/api/health` says whether the bot is alive by its status code, not only in the body. A bot that failed for
 * good is 503; a bot that is starting, retrying a 409 (another process still polls the same token), running or
 * switched off is 200.
 */

async function healthWithBot(state: TelegramBotRuntimeState) {
  const app = express();
  app.get('/api/health', createHealthHandler(() => ({ state, attempts: 1, lastError: state === 'failed' ? '401: Unauthorized' : undefined })));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('GET /api/health', () => {
  it('is 503 when the bot failed for good', async () => {
    const { status, body } = await healthWithBot('failed');

    expect(status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.telegramBot).toEqual(expect.objectContaining({ state: 'failed', lastError: '401: Unauthorized' }));
  });

  it.each<TelegramBotRuntimeState>(['starting', 'retrying', 'running', 'disabled'])('is 200 while the bot is %s', async (state) => {
    const { status, body } = await healthWithBot(state);

    expect(status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.telegramBot.state).toBe(state);
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });
});
