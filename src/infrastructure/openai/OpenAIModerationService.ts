import OpenAI from 'openai';

export class OpenAIModerationService {
    private readonly openai: OpenAI;

    constructor(openai: OpenAI) {
        this.openai = openai;
    }

    async isAllowed(text: string): Promise<boolean> {
        const response = await this.openai.moderations.create({ input: text });
        const blocked = (response.results[0] as any)?.blocked;
        return blocked === false || blocked === undefined;
    }
}

