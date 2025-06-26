import moderation from '../src/framework/express/middleware/moderation';
import { OpenAIModerationService } from '../src/infrastructure/openai/OpenAIModerationService';

describe('moderation middleware', () => {
  it('returns 400 when blocked', async () => {
    const service = { isAllowed: jest.fn().mockResolvedValue(false) } as unknown as OpenAIModerationService;
    const mw = moderation(service);
    const req = { method: 'POST', body: { text: 'bad' } } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    await mw(req, res, next);

    expect(service.isAllowed).toHaveBeenCalledWith('bad');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'blocked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when allowed', async () => {
    const service = { isAllowed: jest.fn().mockResolvedValue(true) } as unknown as OpenAIModerationService;
    const mw = moderation(service);
    const req = { method: 'POST', body: { content: 'ok' } } as any;
    const res = { status: jest.fn(), json: jest.fn() } as any;
    const next = jest.fn();

    await mw(req, res, next);

    expect(service.isAllowed).toHaveBeenCalledWith('ok');
    expect(next).toHaveBeenCalled();
  });
});
