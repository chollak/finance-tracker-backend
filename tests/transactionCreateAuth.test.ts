/**
 * POST /api/transactions не имел авторизации вообще.
 *
 * В цепочке стоял один resolveUser (createUserResolutionMiddleware), который
 * берёт userId из тела запроса, резолвит его и пропускает дальше. Ни проверки
 * initData, ни проверки владения. Анонимный запрос с чужим userId создавал
 * запись в чужом аккаунте.
 *
 * Второй, более тонкий случай: даже с аутентификацией verifyOwnership
 * пропускает подставленный UUID. При UUID в теле userResolutionMiddleware:128
 * ставит telegramId: null, и условие на authMiddleware:320
 * `if (req.resolvedUser.telegramId && ...)` становится ложным — проверка
 * не срабатывает.
 *
 * Поэтому личность берётся из initData, а не из тела: userId, присланный
 * клиентом, не является утверждением о том, кто он.
 */
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { errorHandler, notFoundHandler } from '../src/delivery/web/express/middleware/errorMiddleware';

const AUTHOR_TELEGRAM_ID = '131184740';
const AUTHOR_UUID = 'dbab93a0-5ac0-447b-91cd-842947b918c8';
const VICTIM_TELEGRAM_ID = '990088776';
const VICTIM_UUID = 'd865ab08-f6ba-48b7-93df-db8866fb1a05';

function buildApp() {
  const createExecute = jest.fn().mockResolvedValue({ success: true, data: 'tx-1' });

  const noop = { execute: jest.fn() } as never;
  const userModule = {
    getGetOrCreateUserUseCase: () => ({
      execute: jest.fn(async ({ telegramId }: { telegramId: string }) => ({
        id: telegramId === AUTHOR_TELEGRAM_ID ? AUTHOR_UUID : VICTIM_UUID,
      })),
    }),
    getGetUserUseCase: () => ({ execute: jest.fn() }),
  } as never;

  const router = express.Router();
  router.use(express.json());
  router.use(
    '/transactions',
    createTransactionRouter(
      { execute: createExecute } as never,
      noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
      undefined,
      userModule
    )
  );
  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app = express();
  app.use('/api', router);

  const server = http.createServer(app);
  return { server, createExecute };
}

describe('POST /api/transactions — авторизация', () => {
  let server: http.Server;
  let baseUrl: string;
  let createExecute: jest.Mock;

  beforeEach(async () => {
    const built = buildApp();
    server = built.server;
    createExecute = built.createExecute;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  const validBody = (userId: string) => ({
    amount: 45000,
    category: 'taxi',
    description: 'Такси',
    type: 'expense',
    userId,
  });

  it('отвергает запрос без авторизации', async () => {
    const res = await post(validBody(VICTIM_TELEGRAM_ID));

    expect(res.status).toBe(401);
    expect(createExecute).not.toHaveBeenCalled();
  });

  it('не даёт создать запись в чужом аккаунте по чужому telegramId', async () => {
    const res = await post(validBody(VICTIM_TELEGRAM_ID), {
      'X-Dev-User-Id': AUTHOR_TELEGRAM_ID,
    });

    // Либо отказ, либо запись ушла автору — но никак не жертве.
    if (res.status < 300) {
      expect(createExecute).toHaveBeenCalledTimes(1);
      expect(createExecute.mock.calls[0][0].userId).not.toBe(VICTIM_TELEGRAM_ID);
      expect(createExecute.mock.calls[0][0].userId).not.toBe(VICTIM_UUID);
    } else {
      expect(createExecute).not.toHaveBeenCalled();
    }
  });

  it('не даёт обойти проверку подстановкой чужого UUID', async () => {
    // Именно этот случай проходил насквозь: при UUID resolvedUser.telegramId
    // равен null, и сравнение владения не выполняется.
    const res = await post(validBody(VICTIM_UUID), {
      'X-Dev-User-Id': AUTHOR_TELEGRAM_ID,
    });

    if (res.status < 300) {
      expect(createExecute).toHaveBeenCalledTimes(1);
      expect(createExecute.mock.calls[0][0].userId).not.toBe(VICTIM_UUID);
    } else {
      expect(createExecute).not.toHaveBeenCalled();
    }
  });

  it('пропускает запись самому себе', async () => {
    const res = await post(validBody(AUTHOR_TELEGRAM_ID), {
      'X-Dev-User-Id': AUTHOR_TELEGRAM_ID,
    });

    expect(res.status).toBe(201);
    expect(createExecute).toHaveBeenCalledTimes(1);
    expect(createExecute.mock.calls[0][0].userId).toBe(AUTHOR_UUID);
  });

  it('гостевой режим продолжает работать', async () => {
    const res = await post(validBody('guest_abc123'));

    expect(res.status).toBe(201);
    expect(createExecute.mock.calls[0][0].userId).toBe('guest_abc123');
  });
});
