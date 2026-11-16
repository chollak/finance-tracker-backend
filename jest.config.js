const { createDefaultPreset } = require('ts-jest');

module.exports = {
  // ts-jest only translates each file: `isolatedModules` in tsconfig.test.json (#293). Checking the types of every
  // test made Jest ten times slower; `npm run typecheck:tests` checks them once, with one `tsc`, before Jest in verify.
  ...createDefaultPreset({ tsconfig: '<rootDir>/tsconfig.test.json' }),
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Agent copies live in .claude/worktrees/ inside the repo (FT-151): without these, a run in the main folder takes
  // every copy's tests and package.json too — 295 suites instead of 93, out of memory, haste name collisions.
  // Anchored to <rootDir>, so a run inside a copy still finds its own tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/', '<rootDir>/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  setupFiles: ['<rootDir>/tests/setup/env.ts']
};
