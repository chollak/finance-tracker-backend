/**
 * The backend reports errors in two shapes: `{ error: { code, message } }` from controllers and
 * `{ error: 'text', code }` from middleware. This reads either, so callers can show or log the real
 * reason instead of a generic "Request failed".
 */
export function readServerError(body: unknown): { serverMessage?: string; code?: string } {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const error = record.error;

  if (error && typeof error === 'object') {
    const nested = error as Record<string, unknown>;
    return {
      serverMessage: typeof nested.message === 'string' ? nested.message : undefined,
      code: typeof nested.code === 'string' ? nested.code : undefined,
    };
  }

  return {
    serverMessage: typeof error === 'string' ? error : typeof record.message === 'string' ? record.message : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
  };
}
