import express from 'express';
import { createUserResolutionMiddleware } from '../src/delivery/web/express/middleware/userResolutionMiddleware';
import { UserModule } from '../src/modules/user/userModule';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #275: the middleware read `req.params.id` as a user id, so on any `/:id` route it would take a record's or an
 * account's id for whom to resolve — and create a user of a number. It reads `userId` (the path's `:userId` or
 * `:telegramId`, the query, the body) and nothing else.
 */
describe('createUserResolutionMiddleware (#275)', () => {
  let server: LoopbackServer;
  const getOrCreate = jest.fn(async ({ telegramId }: { telegramId: string }) => ({ id: `uuid-of-${telegramId}` }));
  const userModule = { getGetOrCreateUserUseCase: () => ({ execute: getOrCreate }) } as unknown as UserModule;

  beforeEach(async () => {
    getOrCreate.mockClear();
    const app = express();
    app.use(express.json());
    const resolve = createUserResolutionMiddleware(userModule);
    const answer = (req: express.Request, res: express.Response) => {
      res.json({ resolvedUser: req.resolvedUser ?? null });
    };
    app.post('/records/:id', resolve, answer);
    app.post('/users/:userId', resolve, answer);
    app.post('/grant', resolve, answer);
    server = await listenOnLoopback(app);
  });

  afterEach(async () => {
    await server.close();
  });

  const post = async (path: string, body: unknown = {}) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('a route\'s :id is not a user: nothing is resolved and no user is made of it', async () => {
    expect(await post('/records/597843119')).toEqual({ status: 200, body: { resolvedUser: null } });
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it('on a /:id route it still reads the userId the body names', async () => {
    expect(await post('/records/597843119', { userId: '131184740' })).toEqual({
      status: 200,
      body: { resolvedUser: { id: 'uuid-of-131184740', telegramId: '131184740' } },
    });
  });

  it('reads :userId of the path and userId of the body; without one it goes on', async () => {
    expect((await post('/users/597843119')).body.resolvedUser).toEqual({ id: 'uuid-of-597843119', telegramId: '597843119' });
    expect((await post('/grant', { userId: '597843119' })).body.resolvedUser).toEqual({ id: 'uuid-of-597843119', telegramId: '597843119' });
    expect(await post('/grant')).toEqual({ status: 200, body: { resolvedUser: null } });
  });
});
