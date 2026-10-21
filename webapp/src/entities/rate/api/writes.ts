import type { QueryClient } from '@tanstack/react-query';
import { balanceReaderKeys } from '@/entities/transaction';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { UsdRates } from '../model/types';
import { rateKeys } from './queries';

/**
 * The own rate (FT-119, RateRow.md). Not hooks: the rate sheet runs them and «Отменить» in the toast runs the
 * reverse. The answer is the rates as `GET /api/rates/usd` gives them; then whatever counts dollars in сум at the
 * rate in effect — the accounts total, Home's balance card and month tiles, History's summary — is read again.
 */
function afterRateChange(queryClient: QueryClient, userId: string, rates: UsdRates): UsdRates {
  queryClient.setQueryData(rateKeys.usd(userId), rates);
  for (const queryKey of balanceReaderKeys(userId)) void queryClient.invalidateQueries({ queryKey });
  return rates;
}

/** Sets the own rate (сум×100 per $1) from today; `since` brings a previous own rate back with its own date. */
export async function setOwnUsdRate(queryClient: QueryClient, userId: string, rateMinor: number, since?: string): Promise<UsdRates> {
  const response = await apiClient.put<UsdRates>(API_ENDPOINTS.RATES.USD_OWN, since ? { rateMinor, since } : { rateMinor });
  return afterRateChange(queryClient, userId, response.data);
}

/** «Вернуть курс ЦБ»: the Central Bank rate is in effect again. */
export async function clearOwnUsdRate(queryClient: QueryClient, userId: string): Promise<UsdRates> {
  const response = await apiClient.delete<UsdRates>(API_ENDPOINTS.RATES.USD_OWN);
  return afterRateChange(queryClient, userId, response.data);
}
