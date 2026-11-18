/**
 * #307 — how the real model reads the set of typical phrases (`tests/fixtures/capturePhrases.json`).
 *
 * Every phrase of the set goes the way a phrase goes in the app — the text fast paths, then the model with the app's
 * own prompt, then the real record on a throwaway SQLite file — and what is written is compared with the set's
 * expected records: how many phrases came out as expected and in which fields the rest differ (amount, type,
 * category, date, number of records…). `--repeat` sends each phrase several times and shows how much the readings of
 * one phrase vary. `--temperature` and `--schema` change only those parameters of the request, for a trial.
 *
 * Costs money: about one request of the parsing model per phrase and repeat (cents for the whole set). Not a part of
 * `npm run verify`; the same set runs there without the network (`tests/capturePhraseSet.test.ts`).
 *
 * Prints the set's invented phrases and what was written — never the key, a request or its headers.
 *
 * Usage: scripts/nvm-exec.sh npm run eval:capture -- [--repeat=3] [--temperature=0] [--schema] [--only=id,id]
 * Described in docs/knowledge-base/08-development/capture-phrase-set.md.
 */

import './capture-eval/quietLogs';
import fs from 'fs';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { transactionLearning } from '../src/shared/application/learning/transactionLearning';
import { openCaptureStand } from './capture-eval/captureStand';
import { loadPhraseSet } from './capture-eval/phraseSet';
import { probeFetch, RequestTrial } from './capture-eval/probeFetch';
import { EvalDeps, ParserOfRun, runEval } from './capture-eval/runEval';
import { formatEval } from './capture-eval/formatEval';

const MAX_REPEAT = 10;
const MAX_JOBS = 8;

const USAGE = `#307 проверка разбора на наборе типичных фраз (настоящий OpenAI, стоит денег — центы за набор)

  npm run eval:capture -- [--repeat=N] [--temperature=X] [--schema] [--only=id,id] [--jobs=N] [--json=<файл>]

  --repeat=N        сколько раз послать каждую фразу, которую читает ИИ (1–${MAX_REPEAT}, по умолчанию 1): виден разброс
  --temperature=X   проба: добавить в запрос temperature (0–2); без параметра запрос как в приложении
  --schema          проба: строгая JSON-схема ответа вместо json_object
  --only=id,id      только эти фразы набора
  --jobs=N          сколько фраз разбирать одновременно (1–${MAX_JOBS}, по умолчанию 4)
  --json=<файл>     записать итог и ответы модели в файл (для таблицы «было/стало» и обновления набора)
  --help            эта справка

Ключ — OPENAI_API_KEY из окружения или .env.local / .env этой копии; он не печатается.`;

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  /** The OpenAI key; empty — none. */
  apiKey: string;
  /** The app's folder: its data/patterns.json are the learned patterns the prompt shows. */
  appRoot: string;
  /** Replaces the stand and the parser in tests. */
  deps?: Partial<EvalDeps>;
}

interface Options {
  help: boolean;
  repeat: number;
  jobs: number;
  trial: RequestTrial;
  only?: string[];
  json?: string;
}

class UsageError extends Error {}

function wholeInRange(flag: string, value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new UsageError(`${flag}: нужно целое число от ${min} до ${max}, а не «${value}»`);
  }
  return parsed;
}

function temperatureOption(value: string): number {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new UsageError(`--temperature: нужно число от 0 до 2, а не «${value}»`);
  }
  return parsed;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { help: false, repeat: 1, jobs: 4, trial: {} };
  for (const arg of argv) {
    const separator = arg.indexOf('=');
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const value = separator === -1 ? '' : arg.slice(separator + 1);
    switch (flag) {
      case '--help':
        options.help = true;
        break;
      case '--repeat':
        options.repeat = wholeInRange(flag, value, 1, MAX_REPEAT);
        break;
      case '--jobs':
        options.jobs = wholeInRange(flag, value, 1, MAX_JOBS);
        break;
      case '--temperature':
        options.trial = { ...options.trial, temperature: temperatureOption(value) };
        break;
      case '--schema':
        options.trial = { ...options.trial, schema: true };
        break;
      case '--only':
        options.only = value.split(',').map(id => id.trim()).filter(Boolean);
        if (options.only.length === 0) throw new UsageError('--only: нужен id фразы из набора');
        break;
      case '--json':
        if (!value) throw new UsageError('--json: нужен путь к файлу');
        options.json = path.resolve(process.cwd(), value);
        break;
      default:
        throw new UsageError(`Неизвестный параметр «${arg}». Справка: --help`);
    }
  }
  return options;
}

function trialWords(trial: RequestTrial): string[] {
  return [
    ...(trial.temperature === undefined ? [] : [`temperature ${trial.temperature}`]),
    ...(trial.schema ? ['строгая JSON-схема ответа'] : []),
  ];
}

/** The app's own parser over a `fetch` that keeps what the model answered. */
function realParser(apiKey: string, trial: RequestTrial): ParserOfRun {
  const probe = probeFetch(trial);
  return {
    parser: new OpenAITranscriptionService(apiKey, { fetch: probe.fetch }),
    calls: () => probe.calls,
    answer: () => probe.answer,
    failure: () => probe.failure,
  };
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.err(`eval:capture: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (options.help) {
    io.out(USAGE);
    return 0;
  }
  if (!io.apiKey.trim()) {
    io.err(
      'eval:capture: нет ключа OpenAI. Задайте OPENAI_API_KEY в окружении или в .env.local этой копии ' +
      '(cp ~/.config/daftar/dev.env .env.local). Без сети тот же набор проверяет npm test -- capturePhraseSet.'
    );
    return 2;
  }

  try {
    const set = loadPhraseSet();
    const unknown = (options.only ?? []).filter(id => !set.phrases.some(phrase => phrase.id === id));
    if (unknown.length > 0) {
      io.err(`eval:capture: в наборе нет фраз: ${unknown.join(', ')}`);
      return 2;
    }

    const result = await runEval(set, options, {
      // The fast path reads the learned words the prompt shows: this copy's, as in the app
      openStand: () => openCaptureStand(transactionLearning),
      parserOfRun: () => realParser(io.apiKey, options.trial),
      ...io.deps,
    });

    io.out(formatEval(result, {
      model: AppConfig.OPENAI_MODEL,
      today: set.today,
      repeat: options.repeat,
      trial: trialWords(options.trial),
      localPatterns: fs.existsSync(path.join(io.appRoot, 'data', 'patterns.json')),
    }));

    if (options.json) {
      const report = {
        model: AppConfig.OPENAI_MODEL,
        trial: options.trial,
        repeat: options.repeat,
        summary: result.summary,
        phrases: result.results.map(({ phrase, byAI, runs }) => ({ id: phrase.id, phrase: phrase.phrase, byAI, runs })),
      };
      fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
      io.out(`\nИтог и ответы модели: ${options.json}`);
    }

    // A model that did not answer is a failed run of the eval; a phrase read differently is its finding
    return result.summary.failedRuns > 0 ? 1 : 0;
  } catch (error) {
    io.err(`eval:capture: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), {
    out: text => process.stdout.write(`${text}\n`),
    err: text => process.stderr.write(`${text}\n`),
    apiKey: AppConfig.OPENAI_API_KEY,
    appRoot: path.resolve(__dirname, '..'),
  }).then(code => {
    process.exitCode = code;
  });
}
