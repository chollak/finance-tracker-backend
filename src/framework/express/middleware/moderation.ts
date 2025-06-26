import { Request, Response, NextFunction } from 'express';
import { OpenAIModerationService } from '../../../infrastructure/openai/OpenAIModerationService';

export default function createModerationMiddleware(service: OpenAIModerationService) {
    return async function (req: Request, res: Response, next: NextFunction) {
        if (req.method !== 'POST') {
            next();
            return;
        }

        const text = typeof req.body?.text === 'string'
            ? req.body.text
            : typeof req.body?.content === 'string'
                ? req.body.content
                : undefined;

        if (!text) {
            next();
            return;
        }

        try {
            const allowed = await service.isAllowed(text);
            if (!allowed) {
                res.status(400).json({ error: 'blocked' });
                return;
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}
