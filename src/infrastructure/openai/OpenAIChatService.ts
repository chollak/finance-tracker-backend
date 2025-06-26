export class OpenAIChatService {
  async parseTransaction(text: string): Promise<any> {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
}
