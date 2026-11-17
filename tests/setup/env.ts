/**
 * Runs before every test file.
 *
 * Jest does not read the env file (#393). `loadEnvironment.ts` loads `.env.local` / `.env` of the folder the process
 * runs in, and a value in a developer's file decided the result: ENABLE_TELEGRAM_POLLING=false there failed 22 bot
 * tests. An empty module stands in its place here, so the application's own code needs no word about tests; the test
 * of the loader takes the real one back with `jest.unmock` (`tests/loggerEnvironment.test.ts`). The guard:
 * `tests/envFileStaysOutOfJest.test.ts`.
 *
 * What a shell or CI exports still reaches the tests, so the values that change who is let in stay pinned: an empty
 * ALLOWED_TELEGRAM_IDS keeps a list from closing access in tests that sign in as test users; tests of the list set it
 * themselves (FT-153). The same for the iPhone Shortcut (FT-155): a capture token and owner would bind every Shortcut
 * test to that owner. Tests of the Shortcut set them themselves.
 */
jest.mock('../../src/shared/infrastructure/config/loadEnvironment', () => ({}));

process.env.ALLOWED_TELEGRAM_IDS = '';
process.env.SHORTCUT_CAPTURE_TOKEN = '';
process.env.SHORTCUT_CAPTURE_OWNER = '';
