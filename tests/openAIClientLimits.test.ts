/**
 * У клиента OpenAI не были заданы пределы ожидания, а дефолты SDK — timeout 600000 мс
 * и maxRetries 2. То есть в патологии бот мог молчать до получаса, не отвечая
 * пользователю вообще ничего. Это не хвост распределения, а отсутствие потолка.
 *
 * Тест охраняет наличие потолка, а не конкретные числа: важно, что ожидание
 * ограничено величиной, соизмеримой с терпением человека, ждущего ответа на
 * «такси 18 тысяч».
 */

const constructorCalls: Array<Record<string, unknown>> = [];

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    audio = { transcriptions: { create: jest.fn() } };
    chat = { completions: { create: jest.fn() } };

    constructor(options: Record<string, unknown>) {
      constructorCalls.push(options);
    }
  },
}));

import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';

describe('пределы клиента OpenAI', () => {
  beforeEach(() => {
    constructorCalls.length = 0;
  });

  it('задаёт потолок ожидания вместо десятиминутного дефолта SDK', () => {
    new OpenAITranscriptionService('test-key');

    expect(constructorCalls).toHaveLength(1);
    const options = constructorCalls[0] as { timeout?: number; maxRetries?: number };

    expect(options.timeout).toBeDefined();
    expect(options.timeout).toBeLessThanOrEqual(30_000);
  });

  it('не растягивает ожидание ретраями', () => {
    new OpenAITranscriptionService('test-key');

    const options = constructorCalls[0] as { timeout?: number; maxRetries?: number };

    expect(options.maxRetries).toBeDefined();
    expect(options.maxRetries).toBeLessThanOrEqual(1);
  });

  it('худший случай ожидания укладывается в минуту', () => {
    new OpenAITranscriptionService('test-key');

    const options = constructorCalls[0] as { timeout?: number; maxRetries?: number };

    // Без явно заданных значений расчёт бессмыслен, поэтому требуем их наличия:
    // иначе тест проходил бы вхолостую на undefined.
    expect(typeof options.timeout).toBe('number');
    expect(typeof options.maxRetries).toBe('number');

    // Каждая попытка ограничена timeout, попыток — исходная плюс ретраи.
    const worstCaseMs = options.timeout! * (options.maxRetries! + 1);
    expect(worstCaseMs).toBeLessThanOrEqual(60_000);
  });

  it('передаёт ключ, полученный аргументом', () => {
    new OpenAITranscriptionService('test-key');

    expect(constructorCalls[0].apiKey).toBe('test-key');
  });
});
