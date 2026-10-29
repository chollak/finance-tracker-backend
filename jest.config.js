module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Agent copies live in .claude/worktrees/ inside the repo (FT-151): without these, a run in the main folder takes
  // every copy's tests and package.json too — 295 suites instead of 93, out of memory, haste name collisions.
  // Anchored to <rootDir>, so a run inside a copy still finds its own tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/', '<rootDir>/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  setupFiles: ['<rootDir>/tests/setup/env.ts']
};
