// Imported first by scripts/capture-eval.ts: the app's logger is created on import and would print every line of
// every capture between the lines of the report. A LOG_LEVEL set in the shell stays.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
// The env loader's own «Environment variables loaded from …» line
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
