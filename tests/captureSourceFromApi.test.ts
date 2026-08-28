/**
 * Поле source добавлено в фазе 1, но контроллер зовёт use case тремя
 * аргументами и четвёртый не передаёт — поэтому source всегда 'telegram',
 * и записи из мини-аппа неотличимы от ботовых.
 *
 * То есть поле есть, а задачи своей не выполняет.
 */
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

import { createVoiceProcessingRouter } from '../src/modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { errorHandler, notFoundHandler } from '../src/delivery/web/express/middleware/errorMiddleware';

const TELEGRAM_ID = '131184740';

function buildApp() {
  const textExecute = jest.fn().mockResolvedValue({ text: '', transactions: [], debts: [] });

  const router = express.Router();
  router.use(express.json());
  router.use(
    '/voice',
    createVoiceProcessingRouter(
      { execute: jest.fn() } as never,
      { execute: textExecute } as never
    )
  );
  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app = express();
  app.use('/api', router);

  return { server: http.createServer(app), textExecute };
}

describe('канал захвата из API', () => {
  let server: http.Server;
  let baseUrl: string;
  let textExecute: jest.Mock;

  beforeEach(async () => {
    const built = buildApp();
    server = built.server;
    textExecute = built.textExecute;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function post(body: unknown) {
    return fetch(`${baseUrl}/api/voice/text-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: JSON.stringify(body),
    });
  }

  it('передаёт source из тела запроса в use case', async () => {
    await post({ text: 'такси 18000', userId: TELEGRAM_ID, source: 'webapp' });

    expect(textExecute).toHaveBeenCalledTimes(1);
    expect(textExecute.mock.calls[0][3]).toBe('webapp');
  });

  it('без source по умолчанию telegram — исторически единственный канал', async () => {
    await post({ text: 'такси 18000', userId: TELEGRAM_ID });

    expect(textExecute.mock.calls[0][3]).toBe('telegram');
  });

  it('принимает shortcut: он появится, когда будет постоянный адрес', async () => {
    await post({ text: 'такси 18000', userId: TELEGRAM_ID, source: 'shortcut' });

    expect(textExecute.mock.calls[0][3]).toBe('shortcut');
  });

  it('отвергает неизвестный канал, а не пишет его в базу', async () => {
    const res = await post({ text: 'такси 18000', userId: TELEGRAM_ID, source: 'ерунда' });

    expect(res.status).toBe(400);
    expect(textExecute).not.toHaveBeenCalled();
  });
});
