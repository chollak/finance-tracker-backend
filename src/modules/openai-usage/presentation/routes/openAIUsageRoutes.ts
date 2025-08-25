import { Router } from 'express';
import { OpenAIUsageController } from '../controllers/openAIUsageController';

export function createOpenAIUsageRoutes(controller: OpenAIUsageController): Router {
  const router = Router();

  // Get detailed usage data
  router.get('/usage', (req, res) => controller.getUsage(req, res));

  // Get usage summary (lightweight)
  router.get('/usage/summary', (req, res) => controller.getUsageSummary(req, res));

  // Force refresh usage data
  router.post('/usage/refresh', (req, res) => controller.refreshUsage(req, res));

  return router;
}