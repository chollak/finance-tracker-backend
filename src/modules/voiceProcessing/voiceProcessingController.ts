import express, { Request, Response } from 'express';
import multer from 'multer';
import { VoiceProcessingModule } from './voiceProcessingModule';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/voice-input', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
    console.log("Uploaded file:", req.file);

    if (!req.file) {
        res.status(400).json({ error: 'No audio file uploaded' });
        return;
    }

    try {
        const useCase = VoiceProcessingModule.getProcessVoiceInputUseCase();
        const result = await useCase.execute({ filePath: req.file.path });
        res.json(result);
    } catch (error) {
        console.error('Error processing voice input:', error);
        res.status(500).json({ error: 'Error processing voice input' });
    }
});
router.post('/text-input', async (req: Request, res: Response): Promise<void> => {
    console.log("Uploaded text:", req.body.text);

    if (!req.body.text) {
        res.status(400).json({ error: 'No text file uploaded' });
        return;
    }

    try {
        const useCase = VoiceProcessingModule.getProcessTextInputUseCase();
        const result = await useCase.execute(req.body.text);
        res.json(result);
    } catch (error) {
        console.error('Error processing voice input:', error);
        res.status(500).json({ error: 'Error processing voice input' });
    }
});

export default router;
