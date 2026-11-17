import path from 'path';
import { main } from '../scripts/capture-eval';
import { differences } from '../scripts/capture-eval/compare';
import { CaptureStand } from '../scripts/capture-eval/captureStand';
import { CaptureOutcome, CaptureRecord, loadPhraseSet } from '../scripts/capture-eval/phraseSet';
import { probeFetch } from '../scripts/capture-eval/probeFetch';
import { ParserOfRun } from '../scripts/capture-eval/runEval';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';

/**
 * #307: `npm run eval:capture` without the network. The model is a stand that writes what the set expects — or what a
 * test tells it to — so the counting, the report and the exit codes are checked; the real model is asked only when a
 * person runs the script.
 */

const KEY = 'sk-test-key-that-must-never-be-printed';
const set = loadPhraseSet();
const coffee: CaptureRecord = {
  type: 'expense', semanticType: 'expense', amountMinor: 2_500_000, currency: 'UZS', date: '2026-11-18',
  category: 'Кафе', account: 'Карта', needsReview: false,
};
const one = (record: CaptureRecord): CaptureOutcome => ({ records: [record], withoutAmount: [] });

function io(apiKey = KEY, deps = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out, err,
    cli: { out: (text: string) => out.push(text), err: (text: string) => err.push(text), apiKey, appRoot: path.join(__dirname, '..'), deps },
  };
}

/** A model that is asked for the phrases the set keeps an answer for, and a stand that writes `write(phrase, run)`. */
function fakeModel(write: (phrase: string, run: number) => CaptureOutcome | Error) {
  const runs = new Map<string, number>();
  type Asked = TranscriptionService & { calls: number };
  const stand: CaptureStand = {
    async capture(phrase, ai) {
      const byAI = set.phrases.find(item => item.phrase === phrase)!.ai !== null;
      (ai as Asked).calls = byAI ? 1 : 0;
      const run = runs.get(phrase) ?? 0;
      runs.set(phrase, run + 1);
      const written = write(phrase, run);
      if (written instanceof Error) throw written;
      return written;
    },
    close: async () => undefined,
  };
  const parserOfRun = (): ParserOfRun => {
    const parser = { calls: 0 } as Asked;
    return { parser, calls: () => parser.calls, answer: () => '{"items":[]}', failure: () => undefined };
  };
  return { openStand: async () => stand, parserOfRun };
}

const expectedOf = (phrase: string) => set.phrases.find(item => item.phrase === phrase)!.expected;

describe('eval:capture (#307)', () => {
  it('stops without a key, with a non-zero code and a word on where to put one', async () => {
    const { cli, err, out } = io('');

    expect(await main([], cli)).toBe(2);
    expect(err.join('\n')).toContain('OPENAI_API_KEY');
    expect(out).toEqual([]);
  });

  it('refuses a parameter it does not know and a phrase the set does not have', async () => {
    const unknownFlag = io();
    expect(await main(['--temprature=0'], unknownFlag.cli)).toBe(2);
    expect(unknownFlag.err.join('\n')).toContain('--temprature=0');

    const unknownPhrase = io(KEY, fakeModel(expectedOf));
    expect(await main(['--only=no-such-phrase'], unknownPhrase.cli)).toBe(2);
    expect(unknownPhrase.err.join('\n')).toContain('no-such-phrase');
  });

  it('counts every phrase as matched when the model reads the set as expected, and never prints the key', async () => {
    const { cli, out, err } = io(KEY, fakeModel(expectedOf));

    expect(await main(['--jobs=2'], cli)).toBe(0);

    const report = out.join('\n');
    const byAI = set.phrases.filter(phrase => phrase.ai !== null).length;
    expect(report).toContain(`Набор фраз: ${set.phrases.length}`);
    expect(report).toContain(`совпало прогонов: ${byAI} из ${byAI}`);
    expect(report).toContain(`Быстрый путь (без ИИ): ${set.phrases.length - byAI} фраз, совпало ${set.phrases.length - byAI} из ${set.phrases.length - byAI}`);
    expect(report).not.toContain('Где разошлось');
    expect(`${report}${err.join('\n')}`).not.toContain(KEY);
  });

  it('names the fields a phrase differs in and the spread between its repeats', async () => {
    // The second reading of three puts both records of «кофе 25000 и такси 18000» into another category
    const model = fakeModel((phrase, run) => {
      const expected = expectedOf(phrase);
      if (phrase !== 'кофе 25000 и такси 18000' || run !== 1) return expected;
      return { ...expected, records: expected.records.map(record => ({ ...record, category: 'Другое', needsReview: true })) };
    });
    const { cli, out } = io(KEY, model);

    expect(await main(['--repeat=3', '--only=two-items,friday-dinner,coffee-plain'], cli)).toBe(0);

    const report = out.join('\n');
    expect(report).toContain('Читает ИИ: 2 фраз, 6 прогонов');
    expect(report).toContain('совпало прогонов: 5 из 6');
    expect(report).toContain('фраз, совпавших во всех прогонах: 1 из 2');
    expect(report).toContain('фраз с разбросом (прогоны записали разное): 1 из 2');
    expect(report).toMatch(/категория: 1\n/);
    expect(report).toMatch(/«Нужно проверить»: 1\n/);
    expect(report).toMatch(/сумма: 0\n/);
    expect(report).toContain('прогон 2: −25000.00 UZS Другое 2026-11-18 Карта [проверить]; −18000.00 UZS Другое 2026-11-18 Карта [проверить] — расходится: категория, «Нужно проверить»');
    // The fast-path phrase is read once, whatever --repeat is
    expect(report).toContain('Быстрый путь (без ИИ): 1 фраз, совпало 1 из 1');
  });

  it('ends with a non-zero code when the model did not answer', async () => {
    const { cli, out } = io(KEY, fakeModel(() => new Error('connect ECONNREFUSED')));

    expect(await main(['--only=two-items'], cli)).toBe(1);
    expect(out.join('\n')).toContain('прогонов без ответа модели: 1');
  });
});

describe('what a reading differs in (#307)', () => {
  it('pairs records whatever order the model lists them in', () => {
    const taxi = { ...coffee, amountMinor: 1_800_000, category: 'Транспорт' };

    expect(differences({ records: [coffee, taxi], withoutAmount: [] }, { records: [taxi, coffee], withoutAmount: [] })).toEqual([]);
  });

  it('names each field, and only the number of records when that differs', () => {
    const other = { ...coffee, amountMinor: 4_500, currency: 'USD' as const, type: 'income' as const, date: '2026-11-17', account: 'Наличные' };

    expect(differences(one(coffee), one(other))).toEqual(['amount', 'currency', 'type', 'date', 'account']);
    expect(differences(one(coffee), one({ ...coffee, semanticType: 'group_payment' }))).toEqual(['type']);
    expect(differences(one(coffee), { records: [coffee, other], withoutAmount: [] })).toEqual(['count']);
    expect(differences(one(coffee), { records: [], withoutAmount: [{ description: 'кофе', category: 'Кафе', type: 'expense' }] })).toEqual(['count']);
  });
});

describe('the request of a trial (#307)', () => {
  const completion = () => new Response(
    JSON.stringify({ choices: [{ message: { content: '{"items":[]}' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  const appRequest = JSON.stringify({ model: 'gpt-4.1-mini', messages: [], response_format: { type: 'json_object' } });

  it('is the app\'s request as it is without a trial', async () => {
    const send = jest.fn(async (_url: unknown, _init?: RequestInit) => completion());
    const probe = probeFetch({}, send as never);

    await probe.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: appRequest });

    expect(send.mock.calls[0][1]?.body).toBe(appRequest);
    expect(probe.calls).toBe(1);
    expect(probe.answer).toBe('{"items":[]}');
  });

  it('adds the temperature and the strict schema, and changes nothing else', async () => {
    const send = jest.fn(async (_url: unknown, _init?: RequestInit) => completion());
    const probe = probeFetch({ temperature: 0, schema: true }, send as never);

    await probe.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: appRequest });

    const sent = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: 'gpt-4.1-mini', messages: [], temperature: 0 });
    expect(sent.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(sent.response_format.json_schema.schema.properties.items.items.required).toEqual(
      expect.arrayContaining(['amount', 'currency', 'category', 'type', 'semanticType', 'needsReview', 'date'])
    );
  });

  it('keeps why the model did not answer', async () => {
    const probe = probeFetch({}, (async () => new Response('{}', { status: 429 })) as never);

    await probe.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: appRequest });

    expect(probe.failure).toBe('HTTP 429');
  });
});
