import { describe, expect, it } from 'vitest';
import { readServerError } from './readServerError';

describe('readServerError', () => {
  it('reads the controller envelope', () => {
    expect(readServerError({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid file type' } }))
      .toEqual({ serverMessage: 'Invalid file type', code: 'VALIDATION_ERROR' });
  });

  it('reads the middleware envelope', () => {
    expect(readServerError({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }))
      .toEqual({ serverMessage: 'Too many requests', code: 'RATE_LIMITED' });
  });

  it('falls back to a top-level message and tolerates garbage', () => {
    expect(readServerError({ message: 'Upload failed' })).toEqual({ serverMessage: 'Upload failed', code: undefined });
    expect(readServerError(null)).toEqual({});
    expect(readServerError('oops')).toEqual({});
  });
});
