/**
 * Starter phrasings for the Home capture card.
 *
 * These are the shapes the text pipeline already handles well (see the examples in
 * `docs/QUICK_CAPTURE_API.md`): a short label plus an amount, one line. They exist to show
 * the expected format, so picking one only fills the textarea — a capture writes to the
 * database immediately, so nothing here may auto-submit.
 */
export const CAPTURE_EXAMPLES = ['такси 18к', 'кофе 35к', 'обед 60к', 'перевел 500к'] as const;

export type CaptureExample = typeof CAPTURE_EXAMPLES[number];
