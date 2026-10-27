/**
 * Runs before every test file. AppConfig loads `.env.local`, and dotenv never overrides a variable that is already
 * set: an empty ALLOWED_TELEGRAM_IDS keeps a list there (the live instance's, or one put in a shared dev env) from
 * closing access in tests that sign in as test users. Tests of the list set it themselves (FT-153).
 */
process.env.ALLOWED_TELEGRAM_IDS = '';
