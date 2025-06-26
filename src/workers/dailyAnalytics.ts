import fs from 'fs/promises';
import { NotionService } from '../infrastructure/services/notionService';
import { NotionRepository } from '../modules/transaction/infrastructure/notionRepository';
import { TransactionRepository } from '../modules/transaction/domain/transactionRepository';
import { NOTION_API_KEY, NOTION_DATABASE_ID } from '../config';

export async function runDailyAnalytics(
  repository: TransactionRepository,
  batchUrl: string,
  outputDir: string
): Promise<void> {
  const all = await repository.getAll();
  const yesterday = new Date(Date.now() - 86400000);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const yesterdayTx = all.filter(t => t.date.startsWith(dateStr));

  const response = await fetch(batchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(yesterdayTx)
  });

  if (!response.ok) {
    throw new Error(`Batch request failed with status ${response.status}`);
  }

  const data = await response.json();
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(`${outputDir}/${dateStr}.json`, JSON.stringify(data));
}

(async () => {
  if (require.main !== module) {
    return;
  }

  const notion = new NotionService(NOTION_API_KEY, NOTION_DATABASE_ID);
  const repo = new NotionRepository(notion);
  const endpoint = process.env.BATCH_URL || 'http://localhost:3000/batch';
  const dir = process.env.ANALYTICS_DIR || './analytics';

  try {
    await runDailyAnalytics(repo, endpoint, dir);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
