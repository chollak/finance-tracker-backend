import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { VoiceCaptureStand, openCaptureStand, parserNeverAsked } from '../scripts/capture-eval/captureStand';
import { differences } from '../scripts/capture-eval/compare';
import { CapturePhrase, loadPhraseSet, phraseSetProblems } from '../scripts/capture-eval/phraseSet';

/**
 * #307: the set of typical phrases (`tests/fixtures/capturePhrases.json`) through the whole path after the AI. Every
 * test of the capture path used to replace the parser's result; here the model's answer is the kept JSON, read by the
 * real `OpenAITranscriptionService` over a fake network, and the record is written by the real use cases on a
 * migrated SQLite file — amount in minor units, currency, date from the set's fixed day, category, account, «Нужно
 * проверить». A phrase the fast paths read has no answer: asking the AI for it fails the test.
 *
 * `npm run eval:capture` sends the same phrases to the real model and compares with the same expected records.
 */

// The voice path converts its file with ffmpeg first: faked, as in the other voice tests (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

const set = loadPhraseSet();
const SEED_DIR = path.join(__dirname, '..', 'data');

/** The network of one phrase: the kept answer as a chat completion; how often it was asked. */
function answering(answer: unknown) {
  const fetch = jest.fn(async () => {
    const body = {
      id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: set.recordedWith,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { fetch, parser: new OpenAITranscriptionService('test-api-key', { fetch: fetch as never }) };
}

describe('the set of typical phrases (#307)', () => {
  let stand: VoiceCaptureStand;
  let learningDir: string;

  beforeAll(async () => {
    // The seed's learned words only: a developer's data/patterns.json must not decide which path reads a phrase
    learningDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-set-learning-'));
    fs.mkdirSync(path.join(learningDir, 'data'));
    for (const seed of ['patterns.seed.json', 'learning-data.seed.json']) {
      fs.copyFileSync(path.join(SEED_DIR, seed), path.join(learningDir, 'data', seed));
    }
    stand = await openCaptureStand(new TransactionLearningService(learningDir));
  }, 60_000);

  afterAll(async () => {
    await stand?.close();
    if (learningDir) fs.rmSync(learningDir, { recursive: true, force: true });
  });

  async function written(phrase: CapturePhrase) {
    if (phrase.ai === null) return stand.capture(phrase.phrase, parserNeverAsked(), set.today);
    const { fetch, parser } = answering(phrase.ai);
    const outcome = await stand.capture(phrase.phrase, parser, set.today);
    // A kept answer the fast paths never ask for would be checked by nobody
    expect(fetch).toHaveBeenCalledTimes(1);
    return outcome;
  }

  it('is a set of about forty phrases, each with what it covers and what it should become', () => {
    expect(phraseSetProblems(set)).toEqual([]);
    expect(set.phrases.length).toBeGreaterThanOrEqual(40);
  });

  const sound = set.phrases.filter(phrase => !phrase.knownIssue);
  const known = set.phrases.filter(phrase => phrase.knownIssue);

  it.each(sound.map(phrase => [phrase.id, phrase.phrase, phrase] as const))('%s: «%s»', async (_id, _text, phrase) => {
    expect(await written(phrase)).toEqual(phrase.expected);
  });

  describe('phrases today\'s code writes wrongly — held to what it writes now, until their issue is fixed', () => {
    it.each(known.map(phrase => [phrase.id, phrase.knownIssue!.issue, phrase.phrase, phrase] as const))(
      '%s (#%i): «%s»',
      async (_id, _issue, _text, phrase) => {
        const outcome = await written(phrase);

        expect(outcome).toEqual(phrase.knownIssue!.now);
        // Once the code writes the expected records, the mark goes: the phrase is an ordinary one of the set
        expect(differences(phrase.expected, outcome)).not.toEqual([]);
      }
    );

    it('are listed with their issues', () => {
      const lines = known.map(phrase => `#${phrase.knownIssue!.issue} ${phrase.id}: ${phrase.knownIssue!.note}`);
      process.stdout.write(`\nНабор фраз: известные ошибки кода (${known.length}):\n${lines.join('\n')}\n`);
      expect(known.every(phrase => phrase.knownIssue!.note.trim().length > 0)).toBe(true);
    });
  });

  /**
   * #301: the same phrases said by voice — the transcription is the phrase. A voice has no text fast paths, so only
   * the phrases with a kept answer can be said without the network; after the AI the voice writes with the same code
   * as the text, so each of them becomes what the text path writes.
   */
  describe('said by voice (#301)', () => {
    const answered = set.phrases.filter(phrase => phrase.ai !== null);

    it.each(answered.map(phrase => [phrase.id, phrase.phrase, phrase] as const))('%s: «%s»', async (_id, _text, phrase) => {
      const { fetch, parser } = answering(phrase.ai);

      const outcome = await stand.captureVoice(phrase.phrase, parser, set.today);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(outcome).toEqual(phrase.knownIssue?.now ?? phrase.expected);
    });
  });
});
