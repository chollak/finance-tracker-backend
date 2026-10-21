import { describe, expect, it } from 'vitest';
import { env } from './env';

/**
 * A developer's `webapp/.env.local` may set VITE_MOCK_USER_ID for `npm run dev:full`. Tests must not run as that user:
 * vite.config.ts clears it for Vitest, and a test that needs the dev user mocks `env` itself (see client.test.ts).
 */
describe('env in tests', () => {
  it('has no mock user, whatever the local .env.local says', () => {
    expect(env.mockUserId).toBeNull();
  });
});
