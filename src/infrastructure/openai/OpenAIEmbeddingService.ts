import OpenAI from 'openai';

export class OpenAIEmbeddingService {
    private readonly openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    async embed(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        const [first] = response.data;
        if (!first) {
            throw new Error('No embedding returned');
        }
        return first.embedding as unknown as number[];
    }
}
