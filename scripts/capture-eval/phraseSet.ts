import fs from 'fs';
import path from 'path';

/**
 * The set of typical phrases a change to the parser is compared on (#307): `tests/fixtures/capturePhrases.json`.
 * Every phrase is invented — the repository is public, nothing here comes from a live database.
 *
 * A phrase holds what the AI answered to it (`ai`) and the records the phrase should become (`expected`).
 * `tests/capturePhraseSet.test.ts` runs the path after the AI on the kept answer; `npm run eval:capture` sends the
 * phrase to the real model and compares what is written with the same `expected`.
 */

/** One written record, as far as the set compares it. */
export interface CaptureRecord {
  type: 'income' | 'expense';
  semanticType: string;
  /** In minor units of `currency`: tiyin or cents. */
  amountMinor: number;
  currency: 'UZS' | 'USD';
  /** YYYY-MM-DD; the set's `today` is the day every phrase is said. */
  date: string;
  /** The category's name. */
  category: string;
  /** The account's name: «Карта» (the default one) or «Наличные». */
  account: string;
  /** «Нужно проверить». */
  needsReview: boolean;
}

/** Something the phrase names without an amount: nothing is written, the bot asks «Сколько?». */
export interface UnpricedItem {
  description: string;
  category: string;
  type: 'income' | 'expense';
}

export interface CaptureOutcome {
  records: CaptureRecord[];
  withoutAmount: UnpricedItem[];
}

/** A phrase today's code writes wrongly: the test holds it to `now` and lists it, the fix is the issue's. */
export interface KnownIssue {
  /** The issue of this repository that describes the fault. */
  issue: number;
  note: string;
  /** What the code writes today from the kept answer. */
  now: CaptureOutcome;
}

export interface CapturePhrase {
  id: string;
  phrase: string;
  /** What kind of phrase it stands for. */
  covers: string;
  /**
   * The model's answer as it came (the JSON of the message content), or null when a text fast path reads the phrase
   * and the AI is never asked.
   */
  ai: unknown | null;
  /** Where `ai` is from: `recorded` — the model's own answer; `edited` — its answer with a slip fixed by hand;
   * `constructed` — written by hand to show a shape of answer the code must survive. */
  aiSource?: 'recorded' | 'edited' | 'constructed';
  /** What the phrase should become. */
  expected: CaptureOutcome;
  knownIssue?: KnownIssue;
}

export interface CapturePhraseSet {
  /** The day every phrase is said, YYYY-MM-DD. */
  today: string;
  /** The model the kept answers are from. */
  recordedWith: string;
  phrases: CapturePhrase[];
}

export const PHRASE_SET_PATH = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'capturePhrases.json');

export function loadPhraseSet(file: string = PHRASE_SET_PATH): CapturePhraseSet {
  const set = JSON.parse(fs.readFileSync(file, 'utf-8')) as CapturePhraseSet;
  const problems = phraseSetProblems(set);
  if (problems.length > 0) throw new Error(`The phrase set ${file} is broken:\n- ${problems.join('\n- ')}`);
  return set;
}

/** What is wrong with the set as a file: a day that is no day, a repeated id, a phrase without its expectation. */
export function phraseSetProblems(set: CapturePhraseSet): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(set?.today ?? '')) problems.push('`today` is not YYYY-MM-DD');
  if (!Array.isArray(set?.phrases) || set.phrases.length === 0) return [...problems, '`phrases` is empty'];

  const seen = new Set<string>();
  for (const [index, phrase] of set.phrases.entries()) {
    const name = phrase?.id ? `«${phrase.id}»` : `#${index + 1}`;
    if (!phrase?.id) problems.push(`${name} has no id`);
    else if (seen.has(phrase.id)) problems.push(`${name} is there twice`);
    seen.add(phrase?.id);
    if (!phrase?.phrase?.trim()) problems.push(`${name} has no phrase`);
    if (!phrase?.covers?.trim()) problems.push(`${name} does not say what it covers`);
    if (phrase?.ai === undefined) problems.push(`${name} has no \`ai\` (null for a fast path)`);
    if (!isOutcome(phrase?.expected)) problems.push(`${name} has no expected records`);
    if (phrase?.knownIssue && (!Number.isInteger(phrase.knownIssue.issue) || !isOutcome(phrase.knownIssue.now))) {
      problems.push(`${name} has a knownIssue without its issue number or what is written now`);
    }
  }
  return problems;
}

function isOutcome(outcome: CaptureOutcome | undefined): boolean {
  return Boolean(outcome) && Array.isArray(outcome!.records) && Array.isArray(outcome!.withoutAmount);
}
