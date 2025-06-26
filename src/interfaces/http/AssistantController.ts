import { Router } from 'express';
import { AssistantFacade } from '../../application/assistant/AssistantFacade';

export function createAssistantRouter(facade: AssistantFacade): Router {
  const router = Router();

  router.post('/conversation', async (req, res) => {
    const { message } = req.body as { message?: string };
    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.flushHeaders();

    res.write('data: started\n\n');
    await facade.handle(message);
    res.write('data: done\n\n');
    res.end();
  });

  router.post('/report', async (req, res) => {
    const { message } = req.body as { message?: string };
    await facade.handle(message ?? 'report');
    res.json({ status: 'ok' });
  });

  return router;
}
