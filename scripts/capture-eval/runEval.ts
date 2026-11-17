import { TranscriptionService } from '../../src/modules/voiceProcessing/domain/transcriptionService';
import { CaptureStand } from './captureStand';
import { differences, Field, FIELDS } from './compare';
import { CaptureOutcome, CapturePhrase, CapturePhraseSet } from './phraseSet';

/** A parser for one capture, and what it saw of the model afterwards. */
export interface ParserOfRun {
  parser: TranscriptionService;
  /** Requests sent to the model; zero when a fast path read the phrase. */
  calls(): number;
  /** The model's answer as it wrote it. */
  answer(): string | undefined;
  /** Why the model did not answer, if it did not. */
  failure(): string | undefined;
}

export interface PhraseRun {
  /** What was written; absent when the run failed. */
  outcome?: CaptureOutcome;
  /** The fields it differs from the expected outcome in. */
  differs: Field[];
  /** The model did not answer, or the capture threw. */
  error?: string;
  answer?: string;
}

export interface PhraseResult {
  phrase: CapturePhrase;
  /** The model was asked; false — a text fast path read the phrase, once, whatever `repeat` is. */
  byAI: boolean;
  runs: PhraseRun[];
}

export interface EvalSummary {
  phrases: number;
  byAI: number;
  byFastPath: number;
  /** Runs of the phrases the AI reads. */
  runs: number;
  matchedRuns: number;
  failedRuns: number;
  /** Phrases the AI reads that came out as expected in every run. */
  matchedPhrases: number;
  /** Fast-path phrases that came out as expected. */
  matchedFastPath: number;
  /** Runs that differ in a field, by field. */
  byField: Record<Field, number>;
  /** Phrases whose runs did not all write the same (with `repeat` > 1). */
  unstablePhrases: number;
}

export interface EvalResult {
  results: PhraseResult[];
  summary: EvalSummary;
}

export interface EvalOptions {
  repeat: number;
  /** Captures in flight at once; each needs a stand of its own. */
  jobs: number;
  only?: readonly string[];
}

export interface EvalDeps {
  openStand(): Promise<CaptureStand>;
  parserOfRun(): ParserOfRun;
}

async function runOnce(phrase: CapturePhrase, today: string, stand: CaptureStand, deps: EvalDeps): Promise<{ run: PhraseRun; calls: number }> {
  const asked = deps.parserOfRun();
  try {
    const outcome = await stand.capture(phrase.phrase, asked.parser, today);
    // A simple phrase is written by its label when the model fails: the failure is the run's result, not that record
    const failure = asked.failure();
    if (failure) return { run: { differs: [], error: failure }, calls: asked.calls() };
    return { run: { outcome, differs: differences(phrase.expected, outcome), answer: asked.answer() }, calls: asked.calls() };
  } catch (error) {
    const reason = asked.failure() ?? (error instanceof Error ? error.name : 'capture failed');
    return { run: { differs: [], error: reason }, calls: Math.max(asked.calls(), 1) };
  }
}

async function runPhrase(phrase: CapturePhrase, set: CapturePhraseSet, stand: CaptureStand, options: EvalOptions, deps: EvalDeps): Promise<PhraseResult> {
  const first = await runOnce(phrase, set.today, stand, deps);
  const byAI = first.calls > 0;
  const runs = [first.run];
  // A fast path reads the same every time: repeating it says nothing about the model
  for (let repeat = 1; byAI && repeat < options.repeat; repeat += 1) {
    runs.push((await runOnce(phrase, set.today, stand, deps)).run);
  }
  return { phrase, byAI, runs };
}

const matched = (run: PhraseRun) => !run.error && run.differs.length === 0;

function isUnstable(result: PhraseResult): boolean {
  const written = new Set(result.runs.map(run => (run.error ? 'error' : JSON.stringify(run.outcome))));
  return written.size > 1;
}

export function summarize(results: readonly PhraseResult[]): EvalSummary {
  const ai = results.filter(result => result.byAI);
  const fast = results.filter(result => !result.byAI);
  const runs = ai.flatMap(result => result.runs);
  const byField = Object.fromEntries(
    FIELDS.map(field => [field, runs.filter(run => run.differs.includes(field)).length])
  ) as Record<Field, number>;
  return {
    phrases: results.length,
    byAI: ai.length,
    byFastPath: fast.length,
    runs: runs.length,
    matchedRuns: runs.filter(matched).length,
    failedRuns: runs.filter(run => run.error).length,
    matchedPhrases: ai.filter(result => result.runs.every(matched)).length,
    matchedFastPath: fast.filter(result => result.runs.every(matched)).length,
    byField,
    unstablePhrases: ai.filter(isUnstable).length,
  };
}

/**
 * Every phrase of the set written through the stand with the given parser, `repeat` times each for the phrases the
 * model reads, `jobs` at once. The results keep the set's order.
 */
export async function runEval(set: CapturePhraseSet, options: EvalOptions, deps: EvalDeps): Promise<EvalResult> {
  const phrases = options.only?.length ? set.phrases.filter(phrase => options.only!.includes(phrase.id)) : set.phrases;
  const results: PhraseResult[] = new Array(phrases.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    const stand = await deps.openStand();
    try {
      for (let index = next++; index < phrases.length; index = next++) {
        results[index] = await runPhrase(phrases[index], set, stand, options, deps);
      }
    } finally {
      await stand.close();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.jobs, phrases.length)) }, worker));

  return { results, summary: summarize(results) };
}
