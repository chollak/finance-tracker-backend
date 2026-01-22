import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/appConfig';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.DATABASE);

let supabaseClient: SupabaseClient | null = null;

export function initializeSupabase(): SupabaseClient {
  if (!AppConfig.SUPABASE_URL) {
    throw new Error('SUPABASE_URL is required');
  }

  if (!AppConfig.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is required');
  }

  logger.info('Initializing Supabase client');

  supabaseClient = createClient(
    AppConfig.SUPABASE_URL,
    AppConfig.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false
      }
    }
  );

  logger.info('Supabase client initialized successfully');
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    return initializeSupabase();
  }
  return supabaseClient;
}