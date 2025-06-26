import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';

export class OpenAIEmbeddingService {
    private readonly openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    async embed(text: string): Promise<Float32Array> {
        const response = await this.openai.embeddings.create({
            model: MODEL,
            input: text,
            encoding_format: 'float',
        });
        const embedding = response.data[0]?.embedding;
        if (!embedding || embedding.length !== 1536) {
            throw new Error('Unexpected embedding dimensions');
        }
        return new Float32Array(embedding);
    }
}

