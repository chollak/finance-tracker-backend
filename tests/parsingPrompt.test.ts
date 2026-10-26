import { OPENAI_PROMPTS } from '../src/shared/domain/constants/messages';

/**
 * The record's name is what was bought, in the person's words. gpt-4.1-mini, left with "описание" alone,
 * copied the whole fragment («кофе 25к налом») or wrote its own («оплата такси наличными»).
 */
describe('parsing prompt: the record name', () => {
  it.each(['RU', 'EN'] as const)('%s asks for the name without amount, currency and payment words', (language) => {
    const prompt = OPENAI_PROMPTS[language].USER_ANALYZE_TRANSACTIONS('');

    expect(prompt).toContain('«кофе 25к налом» → "description": "кофе"');
    expect(prompt).toContain('«подписка 9.99$» → "description": "подписка"');
  });
});
