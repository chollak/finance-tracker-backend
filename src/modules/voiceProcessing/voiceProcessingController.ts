import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';

export function createVoiceProcessingRouter(
  voiceUseCase: ProcessVoiceInputUseCase,
  textUseCase: ProcessTextInputUseCase
): Router {
  const router = Router();
  const upload = multer({ dest: 'uploads/' });

  router.post('/voice-input', upload.single('audio'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    try {
      const result = await voiceUseCase.execute({ filePath: req.file.path });
      res.json(result);
    } catch (error) {
      console.error('Error processing voice input:', error);
      res.status(500).json({ error: 'Error processing voice input' });
    }
  });

  router.post('/text-input', async (req: Request, res: Response) => {
    if (!req.body.text) {
      res.status(400).json({ error: 'No text provided' });
      return;
    }

    try {
      const result = await textUseCase.execute(req.body.text);
      res.json(result);
    } catch (error) {
      console.error('Error processing text input:', error);
      res.status(500).json({ error: 'Error processing text input' });
    }
  });

  return router;
}
