import OpenAI from 'openai';

export class OpenAIEmbeddingService {
    private readonly openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    async embed(text: string): Promise<Float32Array> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        const embedding = response.data[0]?.embedding ?? [];
        return new Float32Array(embedding);
    }
}

