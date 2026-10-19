/** Loads the Central Bank of Uzbekistan USD rate for a date; null when there is no answer. */
export interface CbuClient {
  fetchUsdRate(date: string): Promise<{ date: string; rateMinor: number } | null>;
}
