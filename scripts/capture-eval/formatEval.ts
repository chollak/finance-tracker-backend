import { describeOutcome, FIELD_NAMES, FIELDS } from './compare';
import { EvalResult, PhraseResult, PhraseRun } from './runEval';

export interface EvalHeader {
  model: string;
  today: string;
  repeat: number;
  /** How the request differs from the app's, in words; empty — as the app sends it. */
  trial: string[];
  /** Learned patterns of this copy are in the prompt (data/patterns.json), not only the seed. */
  localPatterns: boolean;
}

const share = (part: number, whole: number) => (whole === 0 ? '—' : `${part} из ${whole}`);

function runLine(run: PhraseRun, index: number, repeat: number): string {
  const label = repeat > 1 ? `    прогон ${index + 1}: ` : '    записано: ';
  if (run.error) return `${label}модель не ответила (${run.error})`;
  const differs = run.differs.length ? ` — расходится: ${run.differs.map(field => FIELD_NAMES[field]).join(', ')}` : ' — совпало';
  return `${label}${describeOutcome(run.outcome!)}${differs}`;
}

function phraseBlock(result: PhraseResult, repeat: number): string {
  const { phrase } = result;
  const known = phrase.knownIssue ? ` (известная ошибка кода: #${phrase.knownIssue.issue})` : '';
  return [
    `  ${phrase.id}: «${phrase.phrase}»${result.byAI ? '' : ' — быстрый путь, без ИИ'}${known}`,
    `    ожидалось: ${describeOutcome(phrase.expected)}`,
    ...result.runs.map((run, index) => runLine(run, index, repeat)),
  ].join('\n');
}

/**
 * The report of `npm run eval:capture`: how many phrases came out as expected, where the rest differ, and how much
 * the model's readings of one phrase vary. It prints the set's invented phrases and what was written from them —
 * never the key, a request or its headers.
 */
export function formatEval({ results, summary }: EvalResult, header: EvalHeader): string {
  const lines: string[] = [
    `Набор фраз: ${summary.phrases} (день фраз — ${header.today}); модель ${header.model}`,
    `Запрос: ${header.trial.length ? header.trial.join(', ') : 'как в приложении'}; повторов на фразу: ${header.repeat}`,
  ];
  if (header.localPatterns) {
    lines.push('Внимание: в промпт попали выученные паттерны этой копии (data/patterns.json). Для сравнения «до/после» запускайте в копии без этого файла.');
  }
  lines.push(
    '',
    `Читает ИИ: ${summary.byAI} фраз, ${summary.runs} прогонов`,
    `  совпало прогонов: ${share(summary.matchedRuns, summary.runs)}`,
    `  фраз, совпавших во всех прогонах: ${share(summary.matchedPhrases, summary.byAI)}`,
  );
  if (header.repeat > 1) lines.push(`  фраз с разбросом (прогоны записали разное): ${share(summary.unstablePhrases, summary.byAI)}`);
  if (summary.failedRuns > 0) lines.push(`  прогонов без ответа модели: ${summary.failedRuns}`);
  lines.push(
    '  расхождения по полям (прогонов):',
    ...FIELDS.map(field => `    ${FIELD_NAMES[field]}: ${summary.byField[field]}`),
    '',
    `Быстрый путь (без ИИ): ${summary.byFastPath} фраз, совпало ${share(summary.matchedFastPath, summary.byFastPath)}`,
  );

  const off = results.filter(result => result.runs.some(run => run.error || run.differs.length > 0));
  if (off.length > 0) {
    lines.push('', 'Где разошлось:', ...off.map(result => phraseBlock(result, header.repeat)));
  }
  return lines.join('\n');
}
