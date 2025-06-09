export interface TranscriptionService {
  transcribe(filePath: string): Promise<string>;
  analyzeText(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense' }>;
}
