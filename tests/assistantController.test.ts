import express from 'express';
import { createAssistantRouter } from '../src/interfaces/http/AssistantController';
import { AssistantFacade } from '../src/application/assistant/AssistantFacade';

describe('AssistantController', () => {
  function setup(facade: AssistantFacade) {
    const app = express();
    app.use(express.json());
    app.use('/assistant', createAssistantRouter(facade));
    return app;
  }

  it('streams SSE for conversation', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const facade = { handle } as unknown as AssistantFacade;
    const router = createAssistantRouter(facade);
    const layer: any = router.stack.find(r => r.route?.path === '/conversation');
    const route = layer.route.stack[0].handle as any;
    const req = { body: { message: 'hello' } } as any;
    const res = {
      set: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any;

    await route(req, res);

    expect(handle).toHaveBeenCalledWith('hello');
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    expect(res.write).toHaveBeenCalledWith('data: started\n\n');
    expect(res.write).toHaveBeenCalledWith('data: done\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('returns JSON report', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const facade = { handle } as unknown as AssistantFacade;
    const router = createAssistantRouter(facade);
    const layer: any = router.stack.find(r => r.route?.path === '/report');
    const route = layer.route.stack[0].handle as any;
    const req = { body: { message: 'report' } } as any;
    const res = { json: jest.fn() } as any;

    await route(req, res);

    expect(handle).toHaveBeenCalledWith('report');
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });
});
