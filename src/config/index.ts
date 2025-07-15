import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn('Failed to load .env file');
  } else {
    console.log('Environment variables loaded');
  }
} else {
  console.warn('.env file not found, using environment variables');
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
export const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';
export const TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
export const WEB_APP_URL = process.env.WEB_APP_URL || 'https://sapaev.uz';
export const DOWNLOADS_DIR = path.resolve(
  process.env.DOWNLOADS_DIR || path.join(process.cwd(), 'downloads')
);

export function validateEnv() {
  const missing: string[] = [];
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!NOTION_API_KEY) missing.push('NOTION_API_KEY');
  if (!NOTION_DATABASE_ID) missing.push('NOTION_DATABASE_ID');
  if (missing.length) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
  }
}
