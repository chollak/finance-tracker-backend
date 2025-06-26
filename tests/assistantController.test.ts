import express from 'express';
import request from 'supertest';
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
    const app = setup(facade);

    const res = await request(app)
      .post('/assistant/conversation')
      .send({ message: 'hello' });

    expect(handle).toHaveBeenCalledWith('hello');
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: started');
    expect(res.text).toContain('data: done');
  });

  it('returns JSON report', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const facade = { handle } as unknown as AssistantFacade;
    const app = setup(facade);

    const res = await request(app)
      .post('/assistant/report')
      .send({ message: 'report' });

    expect(handle).toHaveBeenCalledWith('report');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
