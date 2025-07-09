import dotenv from 'dotenv';

const result = dotenv.config();
if (result.error) {
  console.warn('.env file not found');
} else {
  console.log('Environment variables loaded');
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
export const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';
export const TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
export const WEB_APP_URL = process.env.WEB_APP_URL || 'https://sapaev.uz';

export function validateEnv() {
  const missing: string[] = [];
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!NOTION_API_KEY) missing.push('NOTION_API_KEY');
  if (!NOTION_DATABASE_ID) missing.push('NOTION_DATABASE_ID');
  if (missing.length) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
  }
}
