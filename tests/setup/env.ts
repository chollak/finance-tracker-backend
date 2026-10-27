/**
 * Runs before every test file. AppConfig loads `.env.local`, and dotenv never overrides a variable that is already
 * set: an empty ALLOWED_TELEGRAM_IDS keeps a list there (the live instance's, or one put in a shared dev env) from
 * closing access in tests that sign in as test users. Tests of the list set it themselves (FT-153).
 *
 * The same for the iPhone Shortcut (FT-155): a capture token and owner in `.env.local` would bind every Shortcut test
 * to that owner. Tests of the Shortcut set them themselves.
 */
process.env.ALLOWED_TELEGRAM_IDS = '';
process.env.SHORTCUT_CAPTURE_TOKEN = '';
process.env.SHORTCUT_CAPTURE_OWNER = '';
