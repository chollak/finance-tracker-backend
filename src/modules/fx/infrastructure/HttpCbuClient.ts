import { toMinor } from '../../../shared/domain/money/money';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';
import { CbuClient } from '../domain/cbuClient';

const logger = createLogger(LogCategory.SYSTEM);
const TIMEOUT_MS = 10_000;

/** https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/{YYYY-MM-DD}/ — see docs/pastel/money-model.md. */
export const CBU_URL = (date: string) => `https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/${date}/`;

interface CbuItem {
  Ccy?: string;
  Rate?: string | number;
  Nominal?: string | number;
  Date?: string;
}

/**
 * Reads the CBU answer: an array of `{ Ccy: "USD", Rate: "12850.37", Nominal: "1", Date: "16.10.2026" }`.
 * Anything else — an error page, an empty list, a rate that is not a number — counts as no answer.
 */
export function parseCbuResponse(body: unknown, requestedDate: string): { date: string; rateMinor: number } | null {
  const items: CbuItem[] = Array.isArray(body) ? body : body && typeof body === 'object' ? [body as CbuItem] : [];
  const usd = items.find(item => item && item.Ccy === 'USD');
  if (!usd || usd.Rate === undefined) return null;

  let rateMinor: number;
  try {
    rateMinor = toMinor(typeof usd.Rate === 'number' ? usd.Rate : String(usd.Rate));
  } catch {
    return null;
  }
  const nominal = Number(usd.Nominal ?? 1) || 1;
  rateMinor = Math.round(rateMinor / nominal);
  if (rateMinor <= 0) return null;

  // The rate states its own date as DD.MM.YYYY; on a holiday it is the last working day's rate
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(usd.Date ?? ''));
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : requestedDate;
  return { date, rateMinor };
}

export class HttpCbuClient implements CbuClient {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async fetchUsdRate(date: string): Promise<{ date: string; rateMinor: number } | null> {
    try {
      const response = await this.fetchImpl(CBU_URL(date), { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        logger.warn('CBU rate request failed', { status: response.status, date });
        return null;
      }
      const parsed = parseCbuResponse(await response.json(), date);
      if (!parsed) logger.warn('CBU rate response not understood', { date });
      return parsed;
    } catch (error) {
      logger.warn('CBU rate unavailable', { date, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}
