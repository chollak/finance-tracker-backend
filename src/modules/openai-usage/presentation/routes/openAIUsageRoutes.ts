import { Router } from 'express';
import { OpenAIUsageController } from '../controllers/openAIUsageController';
import { requireAdmin } from '../../../../delivery/web/express/middleware/authMiddleware';
import { adminRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

export function createOpenAIUsageRoutes(controller: OpenAIUsageController): Router {
  const router = Router();

  // Apply admin rate limiting to all routes
  router.use(adminRateLimiter);

  // All OpenAI usage endpoints are admin-only (expose cost/usage information)
  // Get detailed usage data
  router.get('/usage', requireAdmin, (req, res) => controller.getUsage(req, res));

  // Get usage summary (lightweight)
  router.get('/usage/summary', requireAdmin, (req, res) => controller.getUsageSummary(req, res));

  // Force refresh usage data
  router.post('/usage/refresh', requireAdmin, (req, res) => controller.refreshUsage(req, res));

  return router;
}