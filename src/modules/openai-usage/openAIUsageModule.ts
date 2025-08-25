import { Router } from 'express';
import { OpenAIUsageRepositoryImpl } from './infrastructure/openAIUsageRepository';
import { GetOpenAIUsage } from './application/getOpenAIUsage';
import { OpenAIUsageController } from './presentation/controllers/openAIUsageController';
import { createOpenAIUsageRoutes } from './presentation/routes/openAIUsageRoutes';

export interface OpenAIUsageModule {
  getOpenAIUsage: GetOpenAIUsage;
  controller: OpenAIUsageController;
  routes: Router;
}

export function createOpenAIUsageModule(): OpenAIUsageModule {
  // Infrastructure
  const repository = new OpenAIUsageRepositoryImpl();
  
  // Application
  const getOpenAIUsage = new GetOpenAIUsage(repository);
  
  // Presentation
  const controller = new OpenAIUsageController(getOpenAIUsage);
  const routes = createOpenAIUsageRoutes(controller);
  
  return {
    getOpenAIUsage,
    controller,
    routes
  };
}