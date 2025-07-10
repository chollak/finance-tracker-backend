export interface TranscriptionService {
  transcribe(filePath: string): Promise<string>;
  analyzeTransactions(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense'; date: string }[]>;
}
