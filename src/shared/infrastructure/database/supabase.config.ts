import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/appConfig';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.DATABASE);

let supabaseClient: SupabaseClient | null = null;

export function initializeSupabase(): SupabaseClient {
  if (!AppConfig.SUPABASE_URL) {
    throw new Error('SUPABASE_URL is required');
  }

  // Prefer service_role key (bypasses RLS) for server-side operations
  // Fall back to anon_key if service_role not available
  const supabaseKey = AppConfig.SUPABASE_SERVICE_ROLE_KEY || AppConfig.SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required');
  }

  const keyType = AppConfig.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
  logger.info(`Initializing Supabase client with ${keyType} key`);

  supabaseClient = createClient(
    AppConfig.SUPABASE_URL,
    supabaseKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
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