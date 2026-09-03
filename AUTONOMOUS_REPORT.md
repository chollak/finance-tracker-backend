# Finance Tracker — Autonomous Report

This file records autonomous Hermes/Claude Code development iterations.

## 2026-07-19 — Process setup and baseline audit

### Goal

Set up a controlled development workflow where Hermes acts as PM / tech lead / QA gatekeeper and Claude Code acts as implementation developer.

### Actions Completed

- Clarified agent roles and development process with Shukur.
- Saved the process note to Obsidian vault:
  - `/home/shukur/vault/inbox/2026-07-19-finance-tracker-agent-workflow.md`
- Started project baseline audit.
- Detected that Git showed 437 modified files because of CRLF/LF line ending mismatch.
- Verified the dirty tree was line-ending-only:
  - `git diff --ignore-cr-at-eol --quiet` returned clean.
- Added `.gitattributes` to enforce LF for text files.
- Created local task board:
  - `TASKS.md`

### Baseline Verification

Commands run by Hermes:

```bash
npm run build
```

Result: passed.

```bash
npm test -- --runInBand
```

Result: passed.

Details:

- 7 test suites passed
- 35 tests passed

```bash
npm run build:webapp
```

Result: passed.

```bash
npm run analyze
```

Result: failed.

Observed architecture violations:

1. Circular dependency:
   - `src/shared/infrastructure/database/entities/Debt.ts`
   - `src/shared/infrastructure/database/entities/DebtPayment.ts`
2. Application layer imports infrastructure logging:
   - `src/shared/application/learning/transactionLearning.ts → src/shared/infrastructure/logging/index.ts`
   - `src/shared/application/learning/seedPatterns.ts → src/shared/infrastructure/logging/index.ts`
   - `src/shared/application/helpers/userIdResolver.ts → src/shared/infrastructure/logging/index.ts`

### Current Project State

Working tree now has meaningful uncommitted repo-management files:

- `.gitattributes`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

These are intentional and should be reviewed/committed before feature development.

### Recommended Next Step

Complete FT-001 audit, then run FT-002 through Claude Code:

- fix dependency-cruiser violations
- keep scope limited
- rerun `npm run analyze`, `npm run build`, `npm test -- --runInBand`

### Notes

Do not start product feature work until repo hygiene and architecture checks are stable.


## 2026-07-19 — FT-002 architecture violations fixed

### Goal

Fix dependency-cruiser and circular dependency violations before product feature work.

### Execution

Hermes delegated the implementation to Claude Code with a narrow scope: fix only `npm run analyze` violations, do not commit/push, do not touch secrets. Claude Code resolved most violations but stopped at `max_turns` before full completion. Hermes then independently inspected the diff, found that `madge` still reported the Debt/DebtPayment circular dependency, and completed the minimal fix manually.

### Files Changed

- `src/shared/application/helpers/userIdResolver.ts`
- `src/shared/application/learning/seedPatterns.ts`
- `src/shared/application/learning/transactionLearning.ts`
- `src/shared/infrastructure/database/entities/Debt.ts`
- `src/shared/infrastructure/database/entities/DebtPayment.ts`
- `src/modules/debt/infrastructure/SqliteDebtRepository.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Root Cause

1. Application-layer code imported infrastructure logging directly, violating Clean Architecture dependency direction.
2. TypeORM entity relations used runtime cross-imports between `Debt` and `DebtPayment`, creating a circular dependency.

### Fix

- Application layer now imports logging from `src/shared/application/logging`, which depends on domain ports and uses a registered infrastructure implementation.
- Debt/DebtPayment relations now use TypeORM string relation targets (`'Debt'`, `'DebtPayment'`) and structural relation types, removing runtime cross-imports.
- `SqliteDebtRepository.mapPaymentToEntity` was narrowed to the payment fields it actually reads.

### Verification

```bash
npm run analyze
```

Result: passed.

```bash
npm run build
```

Result: passed.

```bash
npm test -- --runInBand
```

Result: passed.

Details:

- 7 test suites passed
- 35 tests passed

```bash
npm run build:webapp
```

Result: passed.

### Notes

Claude Code was useful for the implementation pass, but Hermes remained the final QA gate and caught the incomplete circular dependency fix before accepting the task.

## 2026-07-19 — FT-001 audit closed

### Goal

Close the baseline audit and decide the next safe development step before giving Claude Code more product work.

### Actual Project State

The project is an AI-powered personal finance tracker with two delivery surfaces:

- Express REST API + Telegram bot backend.
- React/Vite Telegram Mini App frontend under `webapp/`.

The current module set is larger than the older product vision document suggests. Actual backend modules:

1. TransactionModule
2. BudgetModule
3. DebtModule
4. VoiceProcessingModule
5. OpenAIUsageModule
6. DashboardModule
7. SubscriptionModule
8. UserModule

### Stale Documentation Found

`docs/VISION.md` still marks these as launch blockers/TODO:

- DebtModule
- SubscriptionModule

But source code and `docs/knowledge-base/01-architecture/modules.md` show both modules already exist, with entities/use cases/repositories and integration details. This stale roadmap creates a risk that future agents will rebuild or duplicate existing functionality.

### Next Safe Task

FT-003 should be the next Claude Code task: reconcile stale docs with actual implementation.

Scope should be documentation-only:

- Update `docs/VISION.md` to reflect current module state.
- Reconcile `README.md`, `CLAUDE.md`, `AUDIT.md`, and docs under `docs/knowledge-base/` where they disagree.
- Preserve useful implementation guidance.
- Do not modify source code.

### Roadmap Recommendation

After docs are reconciled, choose product direction via FT-004 with Shukur. Candidate vectors remain:

- Improve personal weekly finance review workflow.
- Stabilize core transaction/userId model.
- Improve Telegram bot UX.
- Improve Telegram Mini App UX.
- Import bank/card statements or CSV.
- Production readiness and CI/CD.

### Verification

No code changes were made in FT-001 closeout. Repo was clean before the documentation-board update.

## 2026-07-19 — FT-003 stale docs reconciled with actual implementation

### Goal

Reconcile stale documentation with the actual 8-module implementation before resuming feature
work, so future agents don't rebuild or duplicate DebtModule/SubscriptionModule thinking they're
still TODO.

### Files Changed (docs only)

- `docs/VISION.md`
- `CLAUDE.md`
- `README.md`
- `AUDIT.md`
- `docs/knowledge-base/README.md`
- `docs/knowledge-base/01-architecture/overview.md`
- `TASKS.md`

### What Was Stale

- `docs/VISION.md` listed DebtModule, SubscriptionModule, Payment Integration, and Free Trial as
  🚧 TODO launch blockers, and its "План выхода на прод" described building all four from scratch.
  All four are fully implemented in source: `src/modules/debt/`, `src/modules/subscription/`,
  `src/modules/subscription/infrastructure/TelegramPaymentService.ts` +
  `src/delivery/messaging/telegram/handlers/paymentHandlers.ts` (Telegram Stars payments), and
  `StartTrialUseCase` in `src/modules/subscription/application/grantPremium.ts` (14-day trial).
- `CLAUDE.md` said "7 модулей системы"; `docs/knowledge-base/README.md` said "5 модулей системы";
  `docs/knowledge-base/01-architecture/overview.md` had a 6-row module table missing
  `SubscriptionModule` and `UserModule`. All now say/show 8, matching
  `docs/knowledge-base/01-architecture/modules.md` (which was already correct).
- `README.md` referenced a nonexistent `src/framework/express` path — actual path is
  `src/delivery/web/express/`.
- `AUDIT.md` (2026-01-20) had marked its own "module count mismatch" documentation issue as
  "✅ Fixed", but the fix was never applied — CLAUDE.md and the knowledge-base still had stale
  counts months later. Appended an addendum rather than rewriting the historical report, so the
  audit stays a truthful point-in-time record with a visible correction note.

### One Real Gap Found During Verification

`SubscriptionService.processExpiredSubscriptions()` exists and is documented as "called by cron
job," but no scheduler/cron actually invokes it anywhere in the codebase — subscription expiry
(trial → free downgrade) doesn't currently happen automatically. Recorded as a small follow-up
item in `docs/VISION.md`'s Next Roadmap rather than as a launch blocker.

### Explicitly Not Touched (flagged, not fixed)

- `PROJECT_DOCUMENTATION.md` still describes "5 main modules" and has no sections for
  Debt/Subscription/User modules at all — out of FT-003's named scope, left for a follow-up task.
- `docs/knowledge-base/07-data-flow/*.md` (api-lifecycle, budget-calculation,
  voice-to-transaction) use Russian display names like "Продукты" as example category values
  instead of category IDs like "groceries" — inconsistent with the ID-vs-display-name rule in
  `CLAUDE.md`, but this is a pre-existing, broader inconsistency unrelated to the Debt/Subscription
  staleness this task targeted, so it was left alone rather than rewriting several example flows.

### Verification

```bash
git diff --stat
```
7 files changed, only docs (no `src/`, `tests/`, `webapp/src/`, migrations, package, or env files).

```bash
npm run build        # passed
npm test -- --runInBand   # passed, 7 suites / 35 tests
npm run build:webapp # passed
npm run analyze      # passed (no dependency violations, no circular deps)
```

### Task Board

`TASKS.md` FT-003 checklist items are all checked. Hermes QA accepted the documentation reconciliation and marked FT-003 as `done`.


## 2026-07-19 — FT-003 Hermes QA closeout

### Result

Hermes reviewed the FT-003 documentation reconciliation output and accepted it.

### QA Evidence

- Commit inspected: `534d020 docs: reconcile finance tracker project documentation`
- Changed files were documentation/process files only:
  - `AUDIT.md`
  - `AUTONOMOUS_REPORT.md`
  - `CLAUDE.md`
  - `README.md`
  - `TASKS.md`
  - `docs/VISION.md`
  - `docs/knowledge-base/01-architecture/overview.md`
  - `docs/knowledge-base/README.md`
- Working tree was clean before closeout.
- `HEAD` matched `origin/main` before closeout.

### Decision

FT-003 is accepted and marked `done`. Remaining documentation uncertainty (`PROJECT_DOCUMENTATION.md` and category display-name examples in data-flow docs) is follow-up work, not a blocker for closing FT-003.


## 2026-07-19 — FT-005 started: remaining documentation consistency

### Goal

Close the two documentation consistency follow-ups intentionally left out of FT-003:

1. `PROJECT_DOCUMENTATION.md` still describes the system as having 5 modules and lacks Debt/Subscription/User sections.
2. Data-flow docs under `docs/knowledge-base/07-data-flow/` use Russian category display names in example payload/store values where canonical category IDs should be used.

### Scope

Documentation-only. No source code, config, package, migration, or environment file changes.

### Planned Executor

Claude Code will perform the documentation update. Hermes will independently review the diff, run verification, update reports, commit, and push only after QA passes.

## 2026-07-19 — FT-005 documentation cleanup completed, set to review

### Goal

Close the two documentation consistency follow-ups intentionally left out of FT-003 (see above).

### Files Changed (docs only)

- `PROJECT_DOCUMENTATION.md`
- `docs/knowledge-base/07-data-flow/api-lifecycle.md`
- `docs/knowledge-base/07-data-flow/budget-calculation.md`
- `docs/knowledge-base/07-data-flow/voice-to-transaction.md`
- `TASKS.md`

### What Was Fixed

- `PROJECT_DOCUMENTATION.md` said "5 main modules" and only documented Transaction, VoiceProcessing,
  Budget, OpenAIUsage, and Dashboard. Renumbered the Module System section 1-8
  (Transaction, Budget, Debt, VoiceProcessing, OpenAIUsage, Dashboard, Subscription, User) to match
  `CLAUDE.md` and `docs/knowledge-base/01-architecture/modules.md`, and added DebtModule,
  SubscriptionModule, and UserModule write-ups (use cases, dependencies, infrastructure) that were
  missing entirely. Also updated VoiceProcessingModule's dependency line, since `appModules.ts`
  wires it to both `TransactionModule` and `DebtModule`.
- `docs/knowledge-base/07-data-flow/voice-to-transaction.md`, `api-lifecycle.md`,
  `budget-calculation.md` used Russian category display names (`Продукты`, `Кафе`, `Другое`) as
  example payload/stored values (GPT parse output, API request/response JSON bodies, SQL `INSERT`,
  `categoryIds` arrays, a confidence-scoring code snippet). Replaced these with the canonical
  category IDs from `src/shared/domain/entities/Category.ts` (`groceries`, `restaurants`, `other`),
  matching the ID-vs-display-name rule in `CLAUDE.md` (DB/API/OpenAI payloads store IDs; only UI
  shows localized names).

### Explicitly Left Alone

- The two Telegram bot reply-message examples in `voice-to-transaction.md`
  (`📂 Category: Продукты`) — these are genuine UI display text shown to the end user in a chat
  message, not stored/payload values, so they correctly keep the Russian display name per the
  ID-vs-display-name rule.
- `PROJECT_DOCUMENTATION.md`'s `API Endpoints` section still has no routes listed for
  Debt/Subscription/User modules. This is a real gap, but it's an endpoint reference list rather
  than a "module overview" doc, which was this task's named scope — flagged here as a further
  follow-up rather than fixed.

### Verification

```bash
git diff --stat
```
6 files changed (`AUTONOMOUS_REPORT.md`, `PROJECT_DOCUMENTATION.md`, `TASKS.md`,
`docs/knowledge-base/07-data-flow/{api-lifecycle,budget-calculation,voice-to-transaction}.md`) — no
`src/`, `tests/`, `webapp/src/`, migration, package, or env files touched.

```bash
npm run build             # passed
npm test -- --runInBand   # passed, 7 suites / 35 tests
npm run build:webapp      # passed (public/webapp build output is untracked; no unintended diff)
npm run analyze           # passed (no dependency violations, no circular deps)
```

### Task Board

`TASKS.md` FT-005 checklist items are all checked. Hermes QA accepted the documentation cleanup and marked FT-005 as `done`.


## 2026-07-19 — FT-005 Hermes QA closeout

### Result

Hermes reviewed the FT-005 documentation cleanup output and accepted it.

### QA Evidence

Changed files were documentation/process files only:

- `PROJECT_DOCUMENTATION.md`
- `docs/knowledge-base/07-data-flow/api-lifecycle.md`
- `docs/knowledge-base/07-data-flow/budget-calculation.md`
- `docs/knowledge-base/07-data-flow/voice-to-transaction.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

Hermes independently re-ran:

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

All passed. Test result: 7 suites / 35 tests. Architecture checks: no dependency violations and no circular dependencies.

### Decision

FT-005 is accepted and marked `done`. The missing Debt/Subscription/User entries in `PROJECT_DOCUMENTATION.md`'s API endpoint reference are a real follow-up opportunity, but not a blocker for this docs-consistency task.


## 2026-07-19 — FT-006 started: deep project audit

### Goal

Before feature development, perform a deeper project audit to understand current architecture, infrastructure, dead/unused code candidates, generated artifacts, stale scripts, and cleanup opportunities.

### Approach

Hermes will lead this audit directly. Claude Code may be used later for narrow research tasks, but Hermes remains the source of truth and QA gate.

### Rules

- No broad code changes during audit.
- No deletion/reset of files without explicit approval.
- Findings must be evidence-backed by commands/file inspection.
- Classify findings as confirmed / likely / needs validation.


## 2026-07-19 — FT-006 initial audit findings

### Current Project Map

- Backend: Node.js 20, TypeScript, Express, Telegraf, TypeORM, SQLite/Supabase, OpenAI.
- Frontend: React/Vite Telegram Mini App under `webapp/`, built into ignored `public/webapp/`.
- Backend modules: transaction, budget, debt, voiceProcessing, openai-usage, dashboard, subscription, user.
- Tracked source size:
  - `src`: 149 TypeScript files
  - `tests`: 7 TypeScript files
  - `webapp/src`: 193 source files
  - `scripts`: 15 files
  - `migrations`: 8 SQL files
  - `docs`: 18 markdown files
- Runtime entrypoints:
  - `src/index.ts` initializes config, DB, modules, Express API, static webapp, and Telegram bot.
  - `src/appModules.ts` is the composition root for module wiring.
  - Express API is mounted under `/api`.

### Commands Run

```bash
npm run analyze
npm run build
npx --yes depcheck --json
npx --yes ts-prune --project tsconfig.json
npx madge --orphans --extensions ts src
```

### Green Baseline

- `npm run analyze` passed: no dependency-cruiser violations and no circular dependencies.
- `npm run build` passed.

### Confirmed Findings

1. **Broken legacy Notion migration path**
   - `package.json` has `migrate:notion: node dist/scripts/migrate-from-notion.js`.
   - `docker-compose.yml` migration profile calls `dist/scripts/migrate-from-notion.js`.
   - No tracked `scripts/migrate-from-notion.ts/js` source exists, and `dist/scripts/migrate-from-notion.js` is missing.
   - `DEPLOYMENT.md` still references Notion migration commands under old paths.

2. **Unused dependency candidates**
   - `depcheck` reported `cors`, `@types/cors`, and `shadcn` as unused.
   - `expressServer.ts` explicitly says custom CORS middleware is used instead of the `cors` package.
   - `dependency-cruiser` was reported by depcheck, but it is used in npm scripts (`check:deps`) — keep it.

3. **Missing dependency for script**
   - `depcheck` reported `better-sqlite3` missing in `scripts/migrate-userId.ts`.
   - This script may be obsolete or package.json is incomplete. Needs decision before running that migration.

4. **Subscription expiry scheduler gap**
   - `SubscriptionService.processExpiredSubscriptions()` exists and docs say cron should call it.
   - Search found no scheduler/cron/interval invoking it in source.
   - Trial/premium expiry downgrade likely does not happen automatically.

5. **Likely unused source/barrel files**
   Import graph and `madge --orphans` consistently flag:
   - `delivery/messaging/telegram/handlers/index.ts`
   - `modules/subscription/application/index.ts`
   - `modules/subscription/domain/index.ts`
   - `modules/subscription/presentation/index.ts`
   - `shared/domain/ports/index.ts`
   - `shared/application/learning/seedPatterns.ts`

   These are candidates, not deletion approvals. Barrel files may be intentional public API; `seedPatterns.ts` may be a manual setup utility.

6. **Tracked mutable learning data**
   - `data/learning-data.json` and `data/patterns.json` are tracked.
   - The app has a learning service that writes under `data/`. Runtime learning data being tracked can create noisy diffs and accidental personal-data commits.

7. **Test coverage gap**
   - Current tests: 7 files / 35 tests.
   - Existing coverage is mostly transaction, budget, dashboard, and text input.
   - No direct tests found for debt module, subscription/payment/trial limits, user module, Telegram handlers, or API route integration.

### Likely Architecture / Infrastructure Issues

- `src/index.ts` starts both HTTP server and Telegram bot in the same process. Simple for MVP, but it couples web API lifecycle with bot polling; later we may want explicit mode flags (`api`, `bot`, `worker`) or separate processes.
- Module boundaries pass around concrete modules in the composition root; acceptable for this project now, but some cross-module dependencies (`TransactionModule` knows `SubscriptionModule`, Debt uses Transaction+Subscription+User) should be kept deliberate.
- `postinstall` installs and builds the webapp every time. Convenient for deployment, but slow/noisy for backend-only installs and CI.
- Docker production image copies `scripts/`, but some docker-compose commands reference missing/obsolete migration artifacts.
- `AppConfig` loads `.env.local` then `.env`, while `.env.development` is tracked but not loaded by default; env-file story needs simplification.

### Proposed Cleanup Backlog Draft

1. ✅ Done in FT-007: removed obsolete legacy migration surface from package scripts, Docker Compose, deployment docs, env examples, and stale constants.
2. Decide whether `scripts/migrate-userId.ts` is still needed; either add `better-sqlite3` or archive/remove the script.
3. ✅ Done in FT-009: removed unused root deps `cors`, `@types/cors`, and root `shadcn`; removed obsolete `migrate-userId` scripts that required undeclared `better-sqlite3`.
4. ✅ Done in FT-008: tracked learning examples moved to `data/*.seed.json`; runtime `data/learning-data.json` and `data/patterns.json` are ignored.
5. Add scheduler/worker for `processExpiredSubscriptions()` or explicitly document that expiry is manual.
6. ✅ Done in FT-010: removed confirmed unused barrel/helper files; `madge --orphans` now only reports runtime entrypoint `index.ts`.
7. Add tests for debt, subscription, user, and critical API routes before major feature work.


## 2026-07-19 — FT-007 legacy migration surface removed

### Decision

Shukur confirmed the legacy migration path is no longer needed. Hermes removed the active broken migration surface.

### Changes

- Removed broken migration npm script from `package.json`.
- Removed broken Docker Compose migration profile from `docker-compose.yml`.
- Removed deprecated migration env variables from `.env.example` and tracked `.env.development`.
- Removed matching local `.env` lines without printing secret values.
- Removed stale migration references from:
  - `README.md`
  - `CLAUDE.md`
  - `PROJECT_DOCUMENTATION.md`
  - `DEPLOYMENT.md`
- Removed stale external-service error constant from `src/shared/domain/constants/messages.ts`.

### Verification

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

All passed. Test result: 7 suites / 35 tests. Architecture checks: no dependency violations and no circular dependencies.

### Notes

Historical mentions remain in `TASKS.md` and `AUTONOMOUS_REPORT.md` as audit history, but no active package script, Docker profile, deployment instruction, config example, or source constant points to the removed migration path.


## 2026-07-19 — FT-008 learning seed/runtime policy

### Decision

Treat learning examples as seed fixtures and runtime learning data as local generated data. This keeps the repository reproducible while preventing future user corrections from being accidentally committed.

### TDD

Added `tests/transactionLearning.test.ts` first and verified it failed because `TransactionLearningService` did not accept a test root directory and did not support seed fallback. Then implemented the minimal behavior and watched the tests pass.

### Changes

- Added tracked seed files:
  - `data/learning-data.seed.json`
  - `data/patterns.seed.json`
- Removed tracked runtime files:
  - `data/learning-data.json`
  - `data/patterns.json`
- Updated `.gitignore` to ignore runtime learning files but allow `data/*.seed.json`.
- Updated `TransactionLearningService`:
  - accepts an optional root directory for testing; default remains `process.cwd()`
  - reads `data/learning-data.seed.json` and `data/patterns.seed.json` when runtime files are absent
  - continues writing only to runtime `data/learning-data.json` and `data/patterns.json`
- Updated `seedPatterns.ts` to use canonical category IDs (`restaurants`, `fuel`, `taxi`).
- Updated learning docs in `CLAUDE.md` and `docs/knowledge-base/`.

### Verification

```bash
npm test -- transactionLearning --runInBand
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

All passed. The full test suite now has 8 suites / 37 tests.


## 2026-07-19 — FT-009 started: dependency/script cleanup

### Goal

Clean up confirmed dependency/script issues from FT-006:

- `cors` and `@types/cors` are unused because the project uses custom CORS middleware.
- root `shadcn` CLI is unused by scripts/source.
- `scripts/migrate-userId.ts` imports `better-sqlite3`, which is not declared; the migration is an obsolete one-off script from a past userId transition.

### Rules

- Do not touch runtime data or databases.
- Use npm to update `package-lock.json`.
- Keep `dependency-cruiser` even if depcheck reports it: it is used by `npm run check:deps`.


## 2026-07-19 — FT-009 dependency/script cleanup completed

### Changes

- Removed unused root dependencies via npm:
  - `cors`
  - `@types/cors`
  - `shadcn`
- Removed obsolete one-off migration scripts:
  - `scripts/migrate-userId.ts`
  - `scripts/migrate-userId.sql`
- Updated docs that still described the removed `cors` package:
  - `docs/knowledge-base/07-data-flow/api-lifecycle.md`
  - `CLAUDE.md`

### Evidence

- `depcheck` after cleanup reports:
  - no unused runtime dependencies
  - no missing dependencies
  - only `dependency-cruiser` as a known false-positive unused dev dependency; keep it because `npm run check:deps` calls it
  - one known parser warning for commented `tsconfig.json`, not related to dependency cleanup.
- `scripts/migrate-userId.ts` was not referenced by npm scripts and required undeclared `better-sqlite3`.
- `scripts/migrate-userId.sql` was a historical/test-user-specific one-off migration.

### Verification

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
npx --yes depcheck --json
```

Full build/test/analyze passed. Depcheck cleanup items are resolved.


## 2026-07-19 — FT-010 orphan/barrel cleanup completed

### Goal

Review likely unused source/barrel files from FT-006 and remove only confirmed dead files.

### Evidence

Before cleanup, `npx madge --orphans --extensions ts src` reported:

- `delivery/messaging/telegram/handlers/index.ts`
- `modules/subscription/application/index.ts`
- `modules/subscription/domain/index.ts`
- `modules/subscription/presentation/index.ts`
- `shared/application/learning/seedPatterns.ts`
- `shared/domain/ports/index.ts`

Search confirmed these files had no active consumers. The runtime root `src/index.ts` was also reported by madge, but this is expected because it is the application entrypoint, not dead code.

### Changes

Removed confirmed unused files:

- `src/delivery/messaging/telegram/handlers/index.ts`
- `src/modules/subscription/application/index.ts`
- `src/modules/subscription/domain/index.ts`
- `src/modules/subscription/presentation/index.ts`
- `src/shared/domain/ports/index.ts`
- `src/shared/application/learning/seedPatterns.ts`

`seedPatterns.ts` was superseded by the FT-008 seed-file policy (`data/*.seed.json`).

### Verification

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
npx madge --orphans --extensions ts src
```

All project checks passed. `madge --orphans` now reports only `index.ts`, the expected runtime entrypoint.


## 2026-07-19 — Development foundation roadmap

### Direction

Shukur clarified: do not implement subscription expiry automation yet. Focus on preparing the foundation for development.

### Plan

Saved detailed roadmap:

- `.hermes/plans/2026-07-19_173252-development-foundation-roadmap.md`

### Prioritized Foundation Backlog

1. FT-011 — CI quality gate consolidation
2. FT-012 — Standardize project command surface (`npm run verify`)
3. FT-013 — Environment/config cleanup
4. FT-014 — Test safety net for core modules
5. FT-015 — Runtime/process mode decision document
6. FT-016 — GitHub task workflow foundation

### Notes

- Subscription expiry automation remains a known product/business gap, but it is intentionally deferred.
- Current target is to make future feature work safer: CI, scripts, env clarity, tests, and workflow.


## 2026-07-19 — FT-011/FT-012 CI and verify foundation

### Goal

Create one reliable verification command and make GitHub Actions use it before deploy.

### Changes

- Added npm scripts:
  - `typecheck`: alias for backend TypeScript build
  - `test:ci`: serial Jest run (`jest --runInBand`)
  - `verify`: backend build + serial tests + webapp build + architecture checks
- Updated `.github/workflows/deploy.yml`:
  - renamed the pre-deploy job to `quality-gate`
  - replaced separate partial checks with `npm run verify`
  - deploy now depends on `quality-gate`
- Updated docs:
  - `README.md`
  - `CLAUDE.md`
  - `docs/knowledge-base/08-development/quick-start.md`
- Updated `TASKS.md` foundation statuses.

### Verification

```bash
npm run verify
```

Result: passed. Gate covered backend build, `jest --runInBand` (8 suites / 37 tests), webapp production build, dependency-cruiser, and circular dependency scan.


## 2026-07-19 — FT-013 environment/config cleanup

### Goal

Clarify env file policy and remove ambiguity around `.env`, `.env.local`, and tracked `.env.development` without exposing secrets.

### Discovery

- `AppConfig` loaded `.env.local` if present, otherwise `.env`.
- `.env.development` was tracked but not loaded by the app.
- Local `.env` exists and remains untracked. Keys were inspected with values redacted only.

### Changes

- Removed tracked `.env.development` from the repository.
- Added `.env.development` to `.gitignore` as an ignored local/legacy env filename.
- Updated `AppConfig` comments and startup messages to document the real policy:
  - existing `process.env` values stay highest priority
  - `.env.local` is loaded first when present
  - otherwise `.env` is loaded
  - `.env.development` is intentionally not loaded
- Refreshed `.env.example` as the single tracked safe template.
- Updated env docs in:
  - `README.md`
  - `CLAUDE.md`
  - `DEPLOYMENT.md`
  - `docs/knowledge-base/08-development/quick-start.md`
  - `TASKS.md`

### Verification

```bash
npm run verify
```

Result: passed. Backend build, serial tests (8 suites / 37 tests), webapp build, and architecture checks passed.


## 2026-07-19 — FT-014A debt safety tests

### Goal

Start FT-014 by adding a safety net around the Debt module before product feature development.

### Developer

Claude Code implemented the test file. Hermes reviewed the diff and re-ran verification.

### Changes

- Added `tests/debt.test.ts` with an in-memory `DebtRepository` fake and a mocked `CreateTransactionUseCase`.
- No production source code was changed.
- No package/env/migration/deploy files were changed.

### Behaviors Covered

- `CreateDebtUseCase`:
  - creates debt with expected fields/defaults/status
  - creates linked transaction only when `moneyTransferred=true`
  - validates missing person name, non-positive amount, invalid type
- `PayDebtUseCase`:
  - partial payment decreases remaining amount and records payment
  - full payment marks debt paid and remaining amount zero
  - linked transaction is created by default and can be skipped
  - rejects overpayment, non-active debt, unknown debt, invalid payment input
- `UpdateDebtUseCase`:
  - updates mutable fields
  - not-found path
  - cancel path
- `DeleteDebtUseCase`:
  - delete success and not-found path
- `GetDebtsUseCase`:
  - user/status filtering
  - missing user validation

### Verification

```bash
npm test -- debt --runInBand
npm run verify
```

Result: passed. Debt test file: 21 tests. Full suite: 9 suites / 58 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.

### Notes

These are characterization/safety tests for existing behavior. They use use-case classes with an in-memory fake repository, not TypeORM/SQLite, so they are fast and deterministic.


## 2026-07-19 — FT-014B subscription safety tests

### Goal

Continue FT-014 by adding a safety net around subscription, usage limits, trial, and premium behavior before product feature development.

### Developer

Claude Code implemented the test file. Hermes reviewed the diff and re-ran verification.

### Changes

- Added `tests/subscription.test.ts` with in-memory fakes for `SubscriptionRepository` and `UsageLimitRepository`.
- No production source code was changed.
- No package/env/migration/deploy files were changed.

### Behaviors Covered

- `StartTrialUseCase`:
  - starts 14-day trial for new user
  - refuses additional trial when subscription history exists
- `CheckLimitUseCase`:
  - free-tier allow/block paths
  - remaining usage calculation
  - unlimited active premium path
  - expired premium falls back to free tier
  - active debts limit handled independently
- Usage counter use cases:
  - increment selected counter
  - decrement clamped at zero
  - set active debt count clamped at zero
  - monthly reset clears monthly counters while preserving active debt count
- `GrantPremiumUseCase`:
  - lifetime premium
  - default 30-day gift
  - custom-duration gift
  - prior active subscription is expired before new grant
- `CreateSubscriptionUseCase`:
  - payment replaces active trial
  - payment replaces active payment subscription
  - default price and auto-renew behavior
- `GetSubscriptionUseCase`:
  - free-tier status defaults
  - trial days-left
  - expired trial days-left clamped to zero
  - lifetime subscription days-left is null
- `CancelSubscriptionUseCase`:
  - paid subscription cancel success
  - no active subscription path
  - lifetime/gift refusal paths
- `SubscriptionService`:
  - premium status
  - limit blocking
  - remaining usage
  - expired subscription processing

### Verification

```bash
npm test -- subscription --runInBand
npm run verify
```

Result: passed. Subscription test file: 32 tests. Full suite: 10 suites / 90 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.

### Notes

These are characterization/safety tests for existing behavior. They use use-case/service classes with in-memory fake repositories, not TypeORM/SQLite, so they are fast and deterministic.


## 2026-07-19 — FT-014C user resolution and guest safety tests

### Goal

Continue FT-014 by adding a safety net around user resolution, guest ids, and ownership checks before product feature development.

### Developer

Claude Code implemented the test file. Hermes reviewed the diff and re-ran verification.

### Changes

- Added `tests/userResolution.test.ts` with an in-memory `UserRepository` fake and mocked `UserModule` slices where appropriate.
- No production source code was changed.
- No package/env/migration/deploy files were changed.

### Behaviors Covered

- `GetOrCreateUserUseCase`:
  - creates user for unknown telegramId
  - returns existing user without duplicate creation and updates last seen through repository contract
- `GetUserUseCase`:
  - validation failure when neither id nor telegramId is provided
  - lookup success by id and telegramId
  - current not-found contract returns success with `data: null`
- `UpdateUserUseCase`:
  - updates mutable fields
  - current missing-user contract throws repository error
  - updateLastSeen delegation
- `userIdResolver`:
  - UUID and guest classification
  - sync resolver shortcuts
  - UUID/guest passthrough
  - whitespace trimming
  - telegramId to UUID resolution with deduplication
  - fail-open behavior when resolution throws
  - empty-string current behavior
- `ownershipVerification`:
  - guest bypass when explicitly allowed
  - fail-closed guest behavior when not allowed
  - unauthenticated and missing-userModule errors
  - mismatch and unresolvable-user errors
  - success for matching ownership
  - `verifyAndGetResource` not-found and happy-path behavior

### Verification

```bash
npm test -- userResolution --runInBand
npm run verify
```

Result: passed. User resolution test file: 39 tests. Full suite: 11 suites / 129 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.

### Notes

The tests intentionally document current contracts that may be revisited later: `GetUserUseCase` returns success with `data: null` on not-found, `UpdateUserUseCase` throws on missing user, and `resolveUserIdToUUID` fails open by returning the original id if resolution throws.


## 2026-07-19 — FT-014D critical API route safety tests

### Goal

Complete FT-014 by adding a safety net around critical Express API route/middleware behavior before product feature development.

### Developer

Claude Code implemented the test file. Hermes reviewed the diff and re-ran verification.

### Changes

- Added `tests/apiRoutes.test.ts`.
- Built a minimal in-memory Express app using the real middleware/router factories in the same order as `expressServer.ts` where practical.
- No production source code was changed.
- No package/env/migration/deploy files were changed.

### Behaviors Covered

- Health route returns healthy JSON.
- Unmatched API route returns 404 JSON.
- CORS preflight `OPTIONS` request short-circuits with 200.
- Voice text-input route:
  - JSON body parsing reaches mocked use case
  - guest user can call without auth
  - non-guest without auth is rejected
  - missing text maps to validation error
- Debt route:
  - guest user can create debt without auth
  - non-guest without auth is rejected
  - `X-Dev-User-Id` development bypass reaches controller
- Global error handler:
  - `ValidationError` -> 400
  - generic `Error` -> 500 `INTERNAL_ERROR`
  - malformed JSON -> 400 `INVALID_JSON`

### Verification

```bash
npm test -- apiRoutes --runInBand
npm run verify
```

Result: passed. API route test file: 12 tests. Full suite: 12 suites / 141 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.

### Findings

- Wildcard-mounted `router.use('*', notFoundHandler)` currently makes Express rewrite the path seen by `notFoundHandler` to `/`, so unmatched requests report `Route GET / not found` instead of the actual unmatched path (for example `/does-not-exist`). This is not blocking, but should be included in a later API polish/error-shape cleanup.
- Test output is noisy because request/error logging writes during expected error-path tests. This reinforces the earlier foundation candidate for a silent test logger.

### FT-014 Result

FT-014 is complete. Safety coverage now includes debt, subscription/limits/trial, user resolution/guest behavior, and critical API route/middleware behavior.


## 2026-07-19 — FT-015 runtime/process mode decision

### Goal

Decide how API, Telegram bot, and future worker/scheduler responsibilities should be separated before implementing any background jobs.

### Discovery

- `src/index.ts` is the current composition root.
- Current runtime starts API/static webapp and Telegram bot in one process.
- `SubscriptionService.processExpiredSubscriptions()` exists and is tested, but no scheduler invokes it.
- Shukur explicitly paused subscription expiry automation for now.

### Changes

- Added `docs/knowledge-base/01-architecture/runtime-process-mode.md`.
- Linked it from architecture documentation indexes (`README.md`, `CLAUDE.md`, knowledge-base README).
- Updated `TASKS.md`.

### Decision

Keep the current single process for now.

Recommended future implementation, when the first approved background job arrives:

```text
APP_MODE=all|api|bot|worker
```

Default should remain `APP_MODE=all` to preserve current behavior. Scheduler/background jobs should run only in `APP_MODE=worker` or an explicitly single-instance worker process.

### Non-Goals

No scheduler was implemented. No subscription expiry automation was started. No Docker/runtime behavior changed.

### Verification

```bash
npm run verify
```

Result: passed. No code behavior changed. Full suite: 12 suites / 141 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.


## 2026-07-19 — FT-017 cleanup plan for logs and contracts

### Goal

Preserve findings from FT-014 and define a safe follow-up path without changing production behavior.

### Changes

- Added `docs/knowledge-base/08-development/test-logging-and-contract-cleanup.md`.
- Linked it from development documentation navigation (`README.md`, `CLAUDE.md`, knowledge-base README).
- Added FT-017 to `TASKS.md`.

### Findings Captured

- Noisy test output from expected error-path tests and infrastructure logs.
- `GetUserUseCase` not-found currently returns `success: true, data: null`.
- `UpdateUserUseCase` missing user currently throws.
- `resolveUserIdToUUID` currently fails open when resolution throws.
- Empty string currently reaches user resolution as a telegramId.
- Wildcard-mounted API not-found handler reports `/` instead of the actual unmatched path.

### Recommended Order

1. Quiet test logging.
2. Fix API 404 path message.
3. Decide user Result/error contracts.
4. Validate empty user IDs.
5. Decide resolver fail-open/fail-closed behavior after caller audit.

### Non-Goals

No production code changed. No API contract changed. No scheduler/background automation implemented.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full suite remains 12 suites / 141 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.


## 2026-07-20 — FT-017A quiet test logging

### Goal

Make `npm run verify` easier to scan by suppressing expected application logs during Jest runs, without changing production/development logging behavior.

### Changes

- `src/shared/infrastructure/logging/logger.ts`:
  - Winston logger now uses `silent: true` when `NODE_ENV === 'test'` unless `TEST_LOGS=true`.
- `src/shared/application/logging/index.ts`:
  - fallback console logger becomes a no-op under the same test-only condition.
- `src/shared/infrastructure/config/appConfig.ts`:
  - env-file loading messages are suppressed under the same test-only condition.
- Updated FT-017 cleanup plan and `TASKS.md`.

### Behavior

Production/development logging is unchanged. Developers can opt into verbose test logs with:

```bash
TEST_LOGS=true npm test
```

### Verification

```bash
npm test -- apiRoutes userResolution processTextInput transactionLearning createTransaction --runInBand
npm run verify
```

Result: passed. Targeted noisy suites passed (5 suites / 58 tests) with quiet output, and full verify passed (12 suites / 141 tests) with substantially quieter test output.


## 2026-07-20 — FT-017F API 404 path message

### Goal

Fix the low-risk API 404 message gap found during FT-014D while preserving status and response shape.

### TDD Cycle

1. Updated `tests/apiRoutes.test.ts` to expect the actual unmatched path (`/api/does-not-exist`).
2. Ran `npm test -- apiRoutes --runInBand`; test failed with current `Route GET / not found` behavior.
3. Updated `notFoundHandler` to use `req.originalUrl || req.url || req.path`.
4. Re-ran `npm test -- apiRoutes --runInBand`; test passed.

### Changes

- `src/delivery/web/express/middleware/errorMiddleware.ts`
  - 404 handler now reports original URL.
- `tests/apiRoutes.test.ts`
  - 404 characterization now expects `Route GET /api/does-not-exist not found`.
- Updated FT-017 cleanup plan and `TASKS.md`.

### Verification

```bash
npm test -- apiRoutes --runInBand
npm run verify
```

Result: passed. API route tests passed and full verify passed (12 suites / 141 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-016 task workflow decision

### Goal

Decide whether local `TASKS.md` remains the task source of truth or whether the project should migrate backlog items to GitHub Issues now.

### Discovery

- `TASKS.md` already declares itself as the current local source of truth.
- `gh` is not installed in this environment.
- Shukur has not explicitly chosen GitHub Issues as the primary planning UI.
- The project is still transitioning from foundation cleanup to product-feature backlog.

### Decision

Keep `TASKS.md` as the source of truth for now. Do not create GitHub Issues yet.

### Changes

- Added `docs/knowledge-base/08-development/task-workflow.md`.
- Updated documentation navigation (`README.md`, `CLAUDE.md`, knowledge-base README).
- Marked FT-016 done in `TASKS.md`.

### Future Migration Criteria

Move to GitHub Issues when Shukur wants GitHub UI as the primary task surface, product backlog is stable, tasks are independently shippable, and GitHub tooling/auth is available.

Suggested labels later: `foundation`, `feature`, `bug`, `tech-debt`, `docs`, `test`, `blocked`.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full suite remains 12 suites / 141 tests. Backend build, webapp build, dependency-cruiser, and circular dependency scan passed.


## 2026-07-20 — FT-017C UpdateUserUseCase Result contract

### Goal

Normalize the low-risk user update contract found during FT-014C: `UpdateUserUseCase.execute()` previously returned a raw `User` and propagated repository exceptions, unlike nearby Result-returning use cases.

### Caller Audit

- Direct HTTP caller: `src/modules/user/presentation/controllers/userController.ts`.
- Controller already fetches the existing user before update and maps not-found to HTTP 404.
- Update failure after pre-check should still flow through standard controller error handling.
- `updateLastSeen()` remains a void side-effect helper and was not changed.

### TDD Cycle

1. Updated `tests/userResolution.test.ts` so update success expects `Result.success(User)` and missing-user expects `Result.failure(error)`.
2. Ran `npm test -- userResolution --runInBand`; compile failed because production contract still returned raw `User`.
3. Updated `UpdateUserUseCase.execute()` to return `Result<User>` and normalize thrown repository errors.
4. Updated `userController` to unwrap the Result and route failures through existing controller error handling.
5. Re-ran `npm test -- userResolution --runInBand && npm run build`; both passed.

### Changes

- `src/modules/user/application/updateUserUseCase.ts`
  - `execute()` now returns `Promise<Result<User>>`.
- `src/modules/user/presentation/controllers/userController.ts`
  - unwraps `userResult` and throws `userResult.error` on failure.
- `tests/userResolution.test.ts`
  - updated UpdateUserUseCase tests to verify Result success/failure.
- Updated FT-017 cleanup plan and `TASKS.md`.

### Verification

```bash
npm test -- userResolution --runInBand
npm run build
npm run verify
```

Result: passed. User resolution tests passed, TypeScript build passed, and full verify passed (12 suites / 141 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-017E empty userId validation

### Goal

Close the low-risk resolver gap found during FT-014C: empty user IDs could previously flow into `getOrCreate({ telegramId: '' })`.

### Caller Audit

- Telegram handlers pass `ctx.from.id.toString()`, so empty IDs should not occur in normal Telegram flows.
- Resolver-level validation is still useful because API and helper callers should not be able to create empty-ID users accidentally.
- `tryResolveUserIdSync('')` remains `null`; it is a sync shortcut helper, not the async validation boundary.

### TDD Cycle

1. Updated `tests/userResolution.test.ts` to expect empty/whitespace user IDs to reject with `userId is required` and to verify no user is created for empty ID.
2. Ran `npm test -- userResolution --runInBand`; tests failed because current behavior created/resolved an empty telegramId.
3. Added early trimmed-input validation in `resolveUserIdToUUID()`.
4. Re-ran `npm test -- userResolution --runInBand && npm run build`; both passed.

### Changes

- `src/shared/application/helpers/userIdResolver.ts`
  - throws `ValidationError('userId is required', 'userId')` for empty/whitespace-only IDs.
- `tests/userResolution.test.ts`
  - empty-ID resolver behavior updated from characterization to desired contract.
- Updated FT-017 cleanup plan and `TASKS.md`.

### Verification

```bash
npm test -- userResolution --runInBand
npm run build
npm run verify
```

Result: passed. User resolver tests passed, TypeScript build passed, and full verify passed (12 suites / 142 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-017B GetUserUseCase not-found contract

### Goal

Normalize `GetUserUseCase` not-found behavior. It previously returned `success: true, data: null`, while nearby resource lookup use cases generally return `Result.failure(NotFoundError)`.

### Caller Audit

- `userController` checks `!userResult.success || !userResult.data`, so missing users still map to not-found handling.
- `ownershipVerification` checks `!userResult.success || !userResult.data`, so missing users still fail closed.
- Transaction/debt by-id use cases use `Result.failure(NotFoundError)` for missing resources, so this improves consistency.

### TDD Cycle

1. Updated `tests/userResolution.test.ts` to expect `Result.failure(NotFoundError)` for missing id/telegramId.
2. Ran `npm test -- userResolution --runInBand`; tests failed because current behavior returned `success: true`.
3. Updated `GetUserUseCase` to return `NotFoundError` failures for missing users.
4. Re-ran `npm test -- userResolution --runInBand && npm run build`; both passed.

### Changes

- `src/modules/user/application/getUserUseCase.ts`
  - missing id/telegramId now returns `Result.failure(new NotFoundError('User', idOrTelegramId))`.
- `tests/userResolution.test.ts`
  - not-found characterization updated to desired Result failure contract.
- Updated FT-017 cleanup plan and `TASKS.md`.

### Verification

```bash
npm test -- userResolution --runInBand
npm run build
npm run verify
```

Result: passed. User resolution tests passed, TypeScript build passed, and full verify passed (12 suites / 142 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-017D resolver fail-open decision

### Goal

Audit `resolveUserIdToUUID()` callers and decide whether to globally change fail-open behavior.

### Caller Audit

- Telegram text/voice handlers catch resolver failures and continue with original Telegram ID.
- Telegram stats/today/budget commands rely on resolver with normal `ctx.from.id` input.
- Subscription middleware catches resolver failures and explicitly fail-opens limits when no UUID is available.
- Voice API controller maps thrown resolver errors through controller error handling.
- `userResolutionMiddleware` is closer to a strict API boundary and maps resolver errors to `USER_RESOLUTION_ERROR`.

### Decision

Do not globally change `resolveUserIdToUUID()` from fail-open to fail-closed yet. This would mix compatibility, product-limit, and security semantics in one silent global behavior change.

Future direction: split resolver behavior explicitly:

```ts
resolveUserIdToUUIDLoose(...)
resolveUserIdToUUIDStrict(...)
```

Then migrate security-sensitive/ownership/API boundaries to strict behavior endpoint by endpoint.

### Changes

- Updated FT-017 cleanup plan and `TASKS.md` only.
- No production code change.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full verify passed (12 suites / 142 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-018 API/domain consistency audit

### Goal

Audit API/controller/use-case consistency after foundation cleanup and split safe autonomous architecture follow-up tasks.

### Discovery

Inspected Express composition, route mounts, controllers, application use cases, Result/error conventions, and userId/guest/ownership flows.

Controller inventory highlights:

- `transactionController.ts` is the largest controller (~530 lines) and combines analytics, CRUD, archive, validation, ownership, and learning-update logic.
- Debt/budget/user/transaction controllers repeat manual Result unwrapping.
- Dashboard/budget/debt controllers contain some raw `new Error(...)` validation branches.
- Subscription and voice processing use service-style/raw return conventions rather than Result pattern.

### Output

Added:

```text
docs/knowledge-base/01-architecture/api-domain-consistency-audit.md
```

### Main Findings

1. Controller Result unwrapping is repetitive and not helper-driven.
2. Some client validation paths use raw `new Error(...)`, which maps to 500 `INTERNAL_ERROR`.
3. Use-case return conventions vary; force-normalizing everything would be too broad.
4. `transactionController.ts` needs coverage before any split.
5. Guest/auth/ownership behavior should be captured as a boundary matrix before strict resolver implementation.
6. Subscription limit fail-open behavior is a product/security policy decision.
7. Voice text-input missing `userId` fallback to `'1'` is a product/data correctness policy decision.

### Recommended Next Tasks

Safe autonomous tasks:

- FT-019: Standardize controller Result handling helper, one slice first.
- FT-020: Normalize raw validation errors in controllers, one route family first.
- FT-022: API route coverage matrix.
- FT-024: Auth/user resolution boundary matrix.

Stop for Shukur decision before:

- FT-025: Subscription limit fail-open policy change.
- FT-026: Voice text-input missing userId default change.
- Any transaction/debt accounting semantics change.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only audit; full verify passed (12 suites / 142 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-020A debt controller raw error normalization

### Goal

Start addressing FT-018 Finding F2 with a small TDD slice: prevent a controller resource-not-found path from mapping to 500 due raw `new Error(...)`.

### TDD Cycle

1. Added an API route regression test for `GET /api/debts/debt-1?withPayments=true` where ownership verification succeeds but `executeGetWithPayments()` returns `success: true, data: null`.
2. Ran `npm test -- apiRoutes --runInBand`; test failed with 500 instead of expected 404.
3. Updated `DebtController.getDebt` to return `ErrorFactory.notFound('Debt', debtId)` instead of raw `new Error('Debt not found')` for this branch.
4. Re-ran `npm test -- apiRoutes --runInBand && npm run build`; both passed.

### Changes

- `tests/apiRoutes.test.ts`
  - added 404 regression coverage for null debt lookup after ownership verification.
- `src/modules/debt/presentation/controllers/debtController.ts`
  - normalized defensive null-data branch to `NotFoundError`.
- Updated `TASKS.md` and FT-018 audit doc.

### Verification

```bash
npm test -- apiRoutes --runInBand
npm run build
npm run verify
```

Result: passed. Targeted API route tests passed, TypeScript build passed, and full verify passed (12 suites / 143 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-022 API route coverage matrix

### Goal

Create a route-family coverage matrix before adding more API tests or refactoring controllers.

### Output

Added:

```text
docs/knowledge-base/08-development/api-route-coverage-matrix.md
```

### Summary

Current route-level tests cover high-value critical wiring only: health, 404, CORS, malformed JSON, voice text-input guest/auth/validation, selected debt route behavior, and global error mapping.

Missing/high-value future coverage areas:

- Transaction route ownership/validation slice before transaction controller split/refactor.
- Budget/debt raw validation error slices.
- Subscription route validation and guest/free-tier mapping.
- User route auth/self-access if `/api/users` becomes active frontend surface.

### Recommendation

Do not test every route mechanically. Prioritize route tests for auth/guest/ownership, validation-vs-500 mapping, response-shape contracts, and multi-middleware route wiring.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full verify passed (12 suites / 143 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-024 auth/user resolution boundary matrix

### Goal

Document current auth, guest, ownership, and userId-resolution boundaries before implementing strict resolver behavior.

### Output

Added:

```text
docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md
```

### Summary

Documented semantics for:

- `requireAuth`
- `optionalAuth`
- `allowGuestMode`
- `verifyOwnership`
- `verifyResourceOwnership`
- `createUserResolutionMiddleware`
- `resolveUserIdToUUID`

Route families were classified by auth mode, resolver behavior, ownership guard, guest allowance, and strictness.

### Decision

Do not globally change the loose resolver. Future strict behavior should be explicit:

```ts
resolveUserIdToUUIDLoose(...)
resolveUserIdToUUIDStrict(...)
```

Then migrate security-sensitive paths one route family at a time.

### Stop Conditions

Stop before changing:

- subscription fail-open/fail-closed behavior
- voice text-input missing userId behavior
- guest access policy for debt/budget/transaction resources
- production auth behavior

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full verify passed (12 suites / 143 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-022A transaction route ownership/validation tests

### Goal

Add focused route-level safety coverage for transaction by-id/resource behavior before any transaction controller refactor.

### TDD Cycle

1. Added `tests/transactionRoutes.test.ts` with a minimal Express app mounting the real `createTransactionRouter()` and mocked use cases.
2. Added route tests for missing transaction 404, non-guest resource fail-closed behavior, guest-owned resource read access, and empty update body validation.
3. Ran `npm test -- transactionRoutes --runInBand`; tests failed with 401 for by-id routes because `allowGuestMode` requires a userId before controller/resource ownership can run.
4. Updated transaction resource-scoped routes to use `optionalAuth`, matching Budget/Debt by-id route patterns.
5. Re-ran `npm test -- transactionRoutes --runInBand && npm run build`; both passed.

### Changes

- `tests/transactionRoutes.test.ts`
  - new transaction route-boundary test suite.
- `src/modules/transaction/presentation/controllers/transactionController.ts`
  - by-id/resource-scoped routes now use `optionalAuth` so controller-level `verifyResourceOwnership` can decide guest/non-guest access based on the fetched resource.
- Updated route coverage matrix and `TASKS.md`.

### Verification

```bash
npm test -- transactionRoutes --runInBand
npm run build
npm run verify
```

Result: passed. Transaction route tests passed, TypeScript build passed, and full verify passed (13 suites / 147 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-020B dashboard validation error normalization

### Goal

Continue FT-020 raw controller error cleanup with a dashboard controller TDD slice.

### TDD Cycle

1. Added `tests/dashboardController.test.ts` for missing `userId` branches on dashboard insights and quick stats.
2. Ran `npm test -- dashboardController --runInBand`; both tests failed because raw `new Error('User ID is required')` mapped to 500.
3. Replaced all dashboard missing-userId raw errors with `ErrorFactory.validation('User ID is required')`.
4. Re-ran `npm test -- dashboardController --runInBand && npm run build`; both passed.

### Changes

- `tests/dashboardController.test.ts`
  - added defensive controller validation regression coverage.
- `src/modules/dashboard/presentation/controllers/dashboardController.ts`
  - all missing-userId branches now return `ValidationError`/400 instead of raw `Error`/500.
- Updated FT-018 audit doc and `TASKS.md`.

### Verification

```bash
npm test -- dashboardController --runInBand
npm run build
npm run verify
```

Result: passed. Dashboard controller tests passed, TypeScript build passed, and full verify passed (14 suites / 149 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-020C budget validation error normalization

### Goal

Continue FT-020 raw controller error cleanup with a budget controller TDD slice.

### TDD Cycle

1. Added `tests/budgetController.test.ts` for missing `userId` branches on create budget and budget alerts.
2. Ran `npm test -- budgetController --runInBand`; both tests failed because raw `new Error('User ID is required')` mapped to 500.
3. Replaced all budget missing-userId raw errors with `ErrorFactory.validation('User ID is required')`.
4. Re-ran `npm test -- budgetController --runInBand && npm run build`; both passed.

### Changes

- `tests/budgetController.test.ts`
  - added defensive controller validation regression coverage.
- `src/modules/budget/interfaces/budgetController.ts`
  - all missing-userId branches now return `ValidationError`/400 instead of raw `Error`/500.
- Updated FT-018 audit doc and `TASKS.md`.

### Verification

```bash
npm test -- budgetController --runInBand
npm run build
npm run verify
```

Result: passed. Budget controller tests passed, TypeScript build passed, and full verify passed (15 suites / 151 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-020D debt validation error normalization

### Goal

Continue FT-020 raw controller error cleanup with a debt controller TDD slice.

### TDD Cycle

1. Scanned remaining raw controller errors; `DebtController` was the remaining high-density presentation-layer source.
2. Added `tests/debtController.test.ts` for missing `userId`, `debtId`, and `paymentId` branches.
3. Ran `npm test -- debtController --runInBand`; tests failed because raw `new Error(...)` mapped to 500.
4. Replaced all debt controller missing-id raw errors with `ErrorFactory.validation(...)`.
5. Re-ran `npm test -- debtController --runInBand && npm run build`; both passed.

### Changes

- `tests/debtController.test.ts`
  - added defensive controller validation regression coverage.
- `src/modules/debt/presentation/controllers/debtController.ts`
  - missing userId/debtId/paymentId branches now return `ValidationError`/400 instead of raw `Error`/500.
- Updated FT-018 audit doc and `TASKS.md`.

### Verification

```bash
npm test -- debtController --runInBand
npm run build
npm run verify
```

Result: passed. Debt controller tests passed, TypeScript build passed, and full verify passed (16 suites / 154 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-024A strict userId resolver helper

### Goal

Add an explicit fail-closed userId resolver helper for future security-sensitive API boundaries without changing existing route behavior.

### TDD Cycle

1. Added tests to `tests/userResolution.test.ts` for `resolveUserIdToUUIDStrict(...)`.
2. Initial targeted test run failed because the strict helper did not exist.
3. Implemented `resolveUserIdToUUIDStrict(...)` in `userIdResolver.ts`.
4. Re-ran `npm test -- userResolution --runInBand && npm run build`; both passed.

### Changes

- `src/shared/application/helpers/userIdResolver.ts`
  - added `resolveUserIdToUUIDStrict(...)`; existing `resolveUserIdToUUID(...)` remains fail-open.
- `tests/userResolution.test.ts`
  - added strict resolver coverage: UUID/guest passthrough, telegramId resolution, fail-closed errors, empty-id validation.
- `docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md`
  - marked FT-024A done and recorded no route migration yet.

### Verification

```bash
npm test -- userResolution --runInBand
npm run build
npm run verify
```

Result: passed. User resolution tests passed, TypeScript build passed, and full verify passed (16 suites / 158 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-019A controller Result helper budget slice

### Goal

Start standardizing repetitive controller Result handling without a broad refactor.

### Work

- Added direct tests for `handleResultResponse(...)`.
- Broadened helper error typing from `AppError` to `unknown` so it can handle actual use-case Result failures and delegate status mapping to `handleControllerError(...)`.
- Refactored BudgetController create/list/summaries/update success/error handling to use `handleResultResponse(...)`.
- Left delete explicit to preserve current `data: null` response shape.

### Verification

```bash
npm test -- controllerHelpers --runInBand
npm test -- budgetController --runInBand
npm run build
npm run verify
```

Result: passed. Controller helper tests, budget controller tests, TypeScript build, and full verify passed (17 suites / 160 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-021 transaction/debt relationship audit

### Goal

Audit current debt ↔ transaction behavior and record money-semantics ambiguities before implementing finance analytics/product features.

### Output

Added:

```text
docs/knowledge-base/01-architecture/transaction-debt-relationship-audit.md
```

### Summary

Current model:

```text
Debt = obligation state
Debt-related Transaction = cash movement
```

Documented:

- `moneyTransferred=false` creates debt only.
- `moneyTransferred=true` creates debt plus `isDebtRelated` transaction.
- Debt payments can create repayment transactions.
- Transaction side uses `relatedDebtId`; debt side has `relatedTransactionId` but current create flow does not populate it.
- Analytics excludes at least some debt-related transactions.

### Findings

- Voice debt response likely reports `linkedTransactionId` as debt ID, not actual transaction ID.
- Future analytics needs separate operating vs cash-flow semantics.
- Do not change money semantics automatically without product decision.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full verify passed (17 suites / 160 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-021A voice debt linkedTransactionId contract

### Goal

Fix the response-contract issue found in FT-021: voice/text debt responses reported the debt ID as `linkedTransactionId` even though no actual transaction ID was available.

### TDD Cycle

1. Added a regression test to `tests/processTextInput.test.ts`.
2. Ran `npm test -- processTextInput --runInBand`; test failed because `linkedTransactionId` was `debt-1`.
3. Updated text and voice input use cases to set `linkedTransactionId` from `result.data.relatedTransactionId` only.
4. Re-ran `npm test -- processTextInput --runInBand && npm run build`; both passed.

### Changes

- `tests/processTextInput.test.ts`
- `src/modules/voiceProcessing/application/processTextInput.ts`
- `src/modules/voiceProcessing/application/processVoiceInput.ts`
- Updated FT-021 audit doc and `TASKS.md`.

### Verification

```bash
npm test -- processTextInput --runInBand
npm run build
npm run verify
```

Result: passed. processTextInput tests, TypeScript build, and full verify passed (17 suites / 161 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-20 — FT-023 DTO/schema validation consistency audit

### Goal

Audit validation layering after FT-020 cleanup and decide whether a schema library is needed before more controller refactors.

### Output

Added:

```text
docs/knowledge-base/01-architecture/dto-schema-validation-audit.md
```

### Decision

Do not add a new schema dependency now.

Keep this split:

```text
Controller: HTTP shape / request parsing / route params
Use case: business invariants / domain rules
Shared validators: reusable primitive/domain validators
Repository: persistence errors only
```

Adopt existing `Validators` / `TransactionValidator` opportunistically in small TDD slices.

### Verification

```bash
npm run verify
```

Result: passed. Docs-only change; full verify passed (17 suites / 161 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-22 — QA-BUG-1 Telegram bot launch failure

### Source

Claude Code local browser QA report: `/tmp/finance-local-browser-qa-report.md`.

### Problem

With invalid/expired `TG_BOT_API_KEY`, `bot.launch()` rejected asynchronously and crashed the whole backend process. The surrounding synchronous `try/catch` did not catch the rejected promise.

### TDD Cycle

1. Added `tests/telegramBot.test.ts` with a mocked Telegraf instance.
2. Initial test failed because `bot.launch()` had no rejection handler.
3. Updated `telegramBot.ts` to attach `.then(...).catch(...)` to `bot.launch()`.
4. Re-ran `npm test -- telegramBot --runInBand && npm run build`; both passed.

### Verification

```bash
npm test -- telegramBot --runInBand
npm run build
npm run verify
```

Result: passed. Telegram bot regression test, TypeScript build, and full verify passed (18 suites / 162 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-22 — QA-BUG-2 friendly SPA 404 page

### Source

Claude Code local browser QA report: `/tmp/finance-local-browser-qa-report.md`.

### Problem

Unknown SPA routes showed React Router's raw developer error page instead of a user-friendly Mini App 404 state. Confirmed by QA in both Vite dev and production static build.

### Changes

- Updated `webapp/src/app/router/routes.tsx`.
- Added `NotFoundPage` with existing `EmptyState` + `Button` UI.
- Added `RouterErrorPage` as `errorElement` for router errors.
- Added catch-all `path: '*'` under the main layout.

### Verification

```bash
npm run build:webapp
npm run verify
```

Result: passed. Full verify passed (18 suites / 162 tests, backend build, webapp build, dependency-cruiser, circular dependency scan).


## 2026-07-22 — QA-BUG-3 Telegram polling config flags

### Source

Claude Code local browser QA report: `/tmp/finance-local-browser-qa-report.md`.

### Problem

`ENABLE_TELEGRAM_POLLING` and `WEBHOOK_MODE` were defined in `AppConfig`/env template but Telegram bot startup did not honor them. The app always attempted polling when `TG_BOT_API_KEY` existed.

### Root cause

`startTelegramBot` only checked token presence before constructing and launching Telegraf. Runtime mode flags were never read at the delivery boundary.

### Changes

- Updated `AppConfig.ENABLE_TELEGRAM_POLLING` to default to enabled unless explicitly set to `false`.
- Updated `startTelegramBot` to skip Telegraf creation/launch when polling is disabled or webhook mode is enabled.
- Expanded `tests/telegramBot.test.ts` with regression coverage for both flags.
- Documented flag behavior in `.env.example` and quick start docs.

### Verification

```bash
npm test -- telegramBot --runInBand
npm run verify
```

Result: passed.


## 2026-07-22 — FT-025 fast simple text transaction parser

### Source

Live dev-bot test after restoring `@FinanceTrackerDevBot` and OpenAI config: text input worked but simple quick-add messages felt slow because they went through OpenAI.

### Problem

`ProcessTextInputUseCase` always called `openAIService.analyzeInput(text)`, even for deterministic quick-add messages such as `кофе 15000 сум`. This added avoidable network latency and OpenAI cost.

### Changes

- Added a local fast path in `src/modules/voiceProcessing/application/processTextInput.ts` for simple text transaction format: `<label> <amount> [сум|sum|uzs]`.
- The fast parser normalizes category aliases through the existing category source of truth (`normalizeCategory`).
- Debt-like phrases (`lent`, `debt`, `долг`, `должен`, `одолжил`, etc.) intentionally bypass the fast path and fall back to OpenAI to preserve debt extraction semantics.
- Added TDD regression coverage in `tests/processTextInput.test.ts` proving `кофе 15000 сум` creates a `coffee` expense transaction without calling OpenAI.

### Verification

```bash
npm test -- processTextInput --runInBand
npm run verify
```

Result: passed. Full verify: 18 suites / 165 tests, backend build, webapp build, dependency-cruiser, circular dependency scan.

### Notes

This is intentionally conservative. More quick-add formats can be added later after observing real usage, but complex language and debts remain OpenAI-backed.

## 2026-07-22 — FT-027A insight-first home and balance terminology

### Goal

Improve the Mini App Home screen after design review by shifting it from generic module dashboard toward a financial-assistant view. Also remove misleading `Баланс` copy because the displayed value is `netIncome`, not a real card/account balance.

### Execution

Hermes wrote the UI improvement roadmap and delegated FT-027A to Claude Code with a narrow frontend-only scope. Claude Code implemented the UI slice without committing or pushing. Hermes reviewed the diff and reran verification independently.

### Files Changed

- `.hermes/plans/2026-07-22_175141-ui-product-improvements.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/widgets/balance-card/ui/BalanceCard.tsx`
- `webapp/src/widgets/attention-summary/index.tsx`
- `webapp/src/widgets/attention-summary/ui/AttentionSummary.tsx`

### Product Changes

- `BalanceCard` title changed from `Баланс` to `Чистый поток за месяц`.
- Description now clarifies: `Доходы минус расходы за период — не остаток на счете`.
- Added `AttentionSummary` under the top card on Home. It surfaces:
  - over-budget count;
  - near-limit budget count;
  - top spending category and amount.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
```

Result:

- backend TypeScript build passed;
- Jest passed: 18 suites / 166 tests;
- webapp build passed;
- dependency-cruiser passed;
- madge circular dependency scan passed.

### Follow-up

Continue with FT-027B: actionable budget remaining UX.

## 2026-07-22 — FT-027B actionable budget remaining UX

### Goal

Make budget UI more actionable by showing the primary meaning of each budget first: remaining amount or overspend, with time context for the current period.

### Execution

Hermes delegated FT-027B to Claude Code with a frontend-only scope. Claude Code changed budget view-model formatting and card presentation without committing or pushing. Hermes reviewed the diff and reran verification independently.

### Files Changed

- `.hermes/plans/2026-07-22_175141-ui-product-improvements.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`
- `webapp/src/entities/budget/lib/toViewModel.ts`
- `webapp/src/entities/budget/model/types.ts`
- `webapp/src/entities/budget/ui/BudgetCard.tsx`
- `webapp/src/widgets/budget-overview/ui/BudgetOverview.tsx`

### Product Changes

- Budget cards now show a prominent headline: `Осталось {amount}` or `Перерасход {amount}`.
- Over-budget amount is calculated as `Math.max(0, spent - amount)` instead of showing `0 сўм`.
- Time context now reads like `До конца месяца • 5 дней осталось`, using existing `period` and `daysRemaining`.
- Spent/total and percentage remain visible but secondary.
- `BudgetOverview` now reuses `budgetToViewModel` for consistency.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
```

Result:

- backend TypeScript build passed;
- Jest passed: 18 suites / 166 tests;
- webapp build passed;
- dependency-cruiser passed;
- madge circular dependency scan passed.

### Follow-up

Continue with FT-027C: mobile add CTA and bottom navigation review.

## 2026-07-22 — FT-027C mobile add CTA and bottom navigation

### Goal

Make the core add-transaction action easier to discover on mobile and reduce FAB overlap with bottom navigation / Telegram safe areas.

### Execution

Hermes delegated FT-027C to Claude Code with a frontend-only scope. Claude Code implemented a central mobile bottom-nav `+` action and safe-area-aware spacing. Hermes reviewed the diff and reran verification independently.

### Files Changed

- `.hermes/plans/2026-07-22_175141-ui-product-improvements.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/shared/ui/layout.tsx`
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- `webapp/src/pages/budgets/ui/BudgetsPage.tsx`
- `webapp/src/pages/debts/ui/DebtsPage.tsx`

### Product Changes

- Mobile bottom nav now has a raised central `+` button that opens `QuickAddSheet`.
- Transactions page no longer duplicates the mobile add-transaction FAB; desktop still keeps the add button.
- Budget and debt page FABs use safe-area-aware bottom spacing to clear bottom nav.
- Main layout bottom padding is safe-area aware.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
```

Result:

- backend TypeScript build passed;
- Jest passed: 18 suites / 166 tests;
- webapp build passed;
- dependency-cruiser passed;
- madge circular dependency scan passed.

### Follow-up

Continue with FT-027D: simplify transaction archive surface.

## 2026-07-22 — FT-027D simplified transaction archive surface

### Goal

Reduce the prominence and technical feel of archive functionality on the Transactions screen while keeping the functionality available and safe.

### Execution

Hermes delegated FT-027D to Claude Code with a frontend-only scope. Claude Code updated copy and moved the bulk archive action out of the header. Hermes reviewed the diff, refined terminology from `баланс` to `текущие итоги`, and reran verification independently.

### Files Changed

- `.hermes/plans/2026-07-22_175141-ui-product-improvements.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`

### Product Changes

- Tabs changed from `Активные` / `Архив` to `Текущие` / `Скрытые`.
- Header no longer shows a prominent bulk archive action.
- Bulk action is now a quiet ghost button below the active transaction list: `Скрыть все текущие`.
- Confirmation dialog clarifies that nothing is deleted and transactions can be restored.
- Empty state for hidden transactions uses less technical copy.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
```

Result:

- backend TypeScript build passed;
- Jest passed: 18 suites / 166 tests;
- webapp build passed;
- dependency-cruiser passed;
- madge circular dependency scan passed.

### Follow-up

Continue with FT-027E: browser/screenshot UI QA.

## 2026-07-22 — FT-027E browser/screenshot UI QA

### Goal

Run browser-level mobile QA after FT-027A–D to verify visual hierarchy, bottom navigation / central CTA behavior, FAB safe-area spacing, console/network cleanliness, and target screen rendering.

### Execution

Claude Code ran a QA-only browser pass using cached Playwright tooling without modifying source files. Hermes inspected the report and screenshot directory.

### Report Artifacts

- Report: `/tmp/finance-ft027e-ui-qa-report.md`
- Screenshots: `/tmp/finance-ft027e-screenshots/` — 15 PNG files

### Screens Tested

- Home: `/`
- Transactions: `/transactions`
- Budgets: `/budgets`
- Add Transaction: `/transactions/add`
- Add Budget: `/budgets/add`

Each screen was tested on both:

- Vite dev server: `http://localhost:5173`
- Express-served production build: `http://localhost:3000`

### Result

Overall: PASS.

- No console errors.
- No page errors.
- No unexpected network 4xx/5xx responses.
- No P0/P1 visual defects.
- Bottom nav / central `+` and FAB safe-area behavior passed viewport checks.

### Non-blocking Findings

- P2 docs/process: legacy `/webapp/*` redirect works, but some docs still imply the app is served under `/webapp`; current routing is root-level.
- P3 dev-only: TanStack Query Devtools icon overlaps the Save button in a dev-server screenshot only; production build is unaffected.
- Limitation: guest-mode browser QA could not visually exercise populated budget/transaction states; it verified empty/gated screens and cross-checked source logic.

### Files Changed

No source files were changed by the QA run. Hermes updated only task/report docs to close FT-027E.

## 2026-07-22 — FT-027F bottom navigation visual polish

### Goal

Fix the bottom navigation aesthetics after Shukur shared a real Telegram Mini App screenshot showing that the FT-027C nav was technically usable but visually too heavy and awkward.

### Issue

The browser QA passed overlap/console/network checks, but it missed aesthetic quality. The actual Telegram screenshot showed:

- oversized black center `+` button;
- cramped `Транзакции` label;
- active state not aligned with the finance green accent;
- visually heavy nav compared with the rest of the clean rounded UI.

### Files Changed

- `webapp/src/shared/ui/bottom-nav.tsx`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Product Changes

- `Транзакции` nav label shortened to `История`.
- Active nav item now uses `text-success`.
- Center add CTA changed from a 56px black circle to a calmer 48px green rounded-square button.
- Nav bar gained subtle backdrop/shadow polish and tighter label spacing.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft027f_nav_screenshot.js
```

Result:

- backend TypeScript build passed;
- Jest passed: 18 suites / 166 tests;
- webapp build passed;
- dependency-cruiser passed;
- madge circular dependency scan passed;
- mobile screenshot captured at `/tmp/ft027f-nav-after.png`;
- screenshot script reported no console errors and no bad network responses.

## 2026-07-22 — FT-027G true-center bottom nav and transactions alignment

### Goal

Fix the real visual issue reported by Shukur: the bottom-nav add button was not centered and the Transactions page felt visually off.

### Root cause

The previous bottom nav had 2 items on the left and 3 on the right around the `+` button. With flex-grow layout this placed the button center at about 41.5% of the screen width instead of 50%.

### Product changes

- Bottom nav is now: `Главная | История | + | Бюджеты | Ещё`.
- `Долги` and `Аналитика` moved to a new `/more` page.
- The center CTA is now inside a `grid-cols-[1fr_auto_1fr]` layout, so its center is mathematically locked to screen center.
- `Ещё` remains active for `/more`, `/debts`, and `/analytics`.
- Transactions page uses the same root width strategy as sibling list pages and has full-width mobile tabs.

### Files changed

- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/shared/lib/constants/routes.ts`
- `webapp/src/app/router/routes.tsx`
- `webapp/src/pages/index.ts`
- `webapp/src/pages/more/index.tsx`
- `webapp/src/pages/more/ui/MorePage.tsx`
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft027g_visual_check.js
node /tmp/ft027g_prod_visual_check.js
node /tmp/ft027g_prod_transactions_check.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Production screenshot check at 390px: add button `centerX = 195`, viewport center `195`.
- Multi-width dev screenshot check at 375/390/412px: button center exactly matched viewport center.
- Transactions screenshot check at 390px: root/tabs center matched viewport center.
- Production screenshots: `/tmp/ft027g-prod-home-390.png`, `/tmp/ft027g-prod-transactions-390.png`.

## 2026-07-22 — FT-027H remove competing mobile budget FAB

### Goal

Clean up the Budget page after Shukur noticed the separate floating create-budget button. With the global bottom-nav center `+`, another mobile FAB on a tab page created visual competition and could feel like a duplicate primary action.

### Product change

- Removed the mobile floating budget FAB.
- Preserved the desktop fixed `Создать бюджет` action.
- Added an in-page mobile `Создать бюджет` CTA for non-empty budget lists.
- Kept the existing empty-state CTA for first-budget creation.

### File changed

- `webapp/src/pages/budgets/ui/BudgetsPage.tsx`

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft027h_budget_auth_screenshot.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Production mobile screenshot: `/tmp/ft027h-prod-budgets-auth-390.png`.
- DOM check confirmed the desktop create-budget button is hidden on mobile and no separate budget FAB appears above the bottom nav.

## 2026-07-22 — FT-027I neutral primary actions and style direction

### Goal

Correct the color semantics mistake in the mobile bottom nav and establish a clearer style direction for the finance UI.

### Decision

Finance Tracker should use a neutral UI shell with semantic money colors. Green/red/orange are reserved for financial states: income, expense, warning, healthy/remaining budgets. Generic primary actions should use neutral/brand tokens, not success green.

### Product/UI changes

- Center bottom-nav `+` changed from green success fill to a neutral surface with border, foreground icon, and subtle shadow.
- Bottom-nav active state changed from green to neutral foreground.
- More page icons changed from success-green chips to neutral secondary chips.
- Added style direction doc: `docs/knowledge-base/10-design-guidelines/style-direction.md`.
- Updated existing design guidelines to make color semantics explicit.

### Files changed

- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/pages/more/ui/MorePage.tsx`
- `webapp/src/app/styles/globals.css`
- `docs/knowledge-base/10-design-guidelines/design-guidelines.md`
- `docs/knowledge-base/10-design-guidelines/style-direction.md`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft027g_prod_visual_check.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Production screenshot at `/tmp/ft027g-prod-home-390.png` confirmed the centered `+` remains at viewport center and no devtools overlay is present.

## 2026-07-22 — FT-027J immediate UI regression cleanup after real-user review

### Goal

Address Shukur's direct UI critique and fix concrete regressions introduced during the previous navigation/design iterations.

### Issues fixed

- The center bottom-nav `+` was too low-contrast when changed to a white/neutral surface. It is now a visible neutral-primary action (`bg-primary`), not green success.
- Transactions page title was incorrectly centered; restored left alignment.
- Transactions tabs looked compressed; increased segmented control height and trigger vertical padding.
- Home attention summary could show income category `Зарплата` as top spending; backend top categories now calculate expense-only, non-debt categories.
- Recent transactions widget used nested fixed-height scrolling and could clip content; replaced with a simple inline list of 5 rows and no row action menu in the Home widget.
- Transaction list amount column is now truncation-safe on narrow screens.
- Debts page still had a mobile floating FAB; removed mobile FAB and preserved desktop fixed action.

### Files changed

- `src/modules/transaction/application/analyticsService.ts`
- `tests/analytics.test.ts`
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- `webapp/src/pages/debts/ui/DebtsPage.tsx`
- `webapp/src/widgets/attention-summary/ui/AttentionSummary.tsx`
- `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`
- `webapp/src/entities/transaction/ui/TransactionListItem.tsx`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run build
npm run verify
node /tmp/ft027j_page_audit.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Screenshot audit paths:
  - `/tmp/ft027j-audit-home-390.png`
  - `/tmp/ft027j-audit-transactions-390.png`
  - `/tmp/ft027j-audit-debts-390.png`
- Visual review confirmed Transactions header is left-aligned, tabs are less compressed, Debts mobile FAB is gone, and bottom-nav center `+` remains centered and visible.

## 2026-07-22 — FT-028 full mobile UI audit and regression cleanup

### Goal

Run a mobile UI audit after Shukur reported multiple visual regressions and inconsistent design decisions.

### Audit artifacts

- Report: `/tmp/ft028-ui-audit/report.md`
- Metrics: `/tmp/ft028-ui-audit/metrics.json`
- Screenshots: `/tmp/ft028-ui-audit/screenshots/*.png`

### Screens audited

- Home
- Transactions
- Budgets
- Debts
- More
- Add Transaction
- Add Budget
- Add Debt
- Analytics

### Immediate fixes

- Bottom nav center `+`: visible neutral-primary, not semantic green and not low-contrast white.
- Transactions: left-aligned header and taller segmented tabs.
- Dashboard top spending: top categories now use expense-only, non-debt transactions, so income categories such as `Зарплата` do not appear as spending.
- Home Recent Transactions: removed nested fixed-height scroll; now shows 5 inline rows and hides row action menu in the widget.
- Transaction list items: amount column now truncation-safe on narrow screens.
- Debts: removed mobile floating FAB and preserved desktop fixed action.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run build
npm run verify
node /tmp/ft028_ui_audit_capture.js
```

Result:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Screenshot audit produced the artifacts listed above.

### Recommendation

Next slice should be FT-029 shared mobile page templates: `PageHeader`, `SegmentedTabs`, empty-state rules, form header/back consistency, and repeatable screenshot QA.

## 2026-07-22 — FT-029A shared mobile page header and segmented tabs foundation

### Goal

Start the design-system cleanup recommended by FT-028 by introducing shared mobile page primitives instead of continuing per-page styling drift.

### Changes

- Added `webapp/src/shared/ui/page-header.tsx` for standard list/overview page headers.
- Added `webapp/src/shared/ui/segmented-tabs.tsx` for consistent Radix segmented tabs.
- Exported both from `webapp/src/shared/ui/index.ts`.
- Migrated headers on Transactions, Budgets, Debts, More, and Analytics pages.
- Migrated Transactions Radix tabs to the new segmented wrappers.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft028_ui_audit_capture.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Screenshot metrics at 390px confirm list-page H1 positions are aligned at `x=16` for Transactions, Budgets, Debts, More.
- Transactions segmented tabs remain full-width at `x=16`, `w=358`, `h=48`.

### Next

Continue with FT-029B: shared segmented control for non-Radix filter tabs, then FT-029C: empty-state and form-page header/back standards.

## 2026-07-22 — FT-029B/C shared segmented controls and form-page headers

### Goal

Continue autonomous FT-029 design-system hardening by replacing page-specific controls with shared primitives.

### Changes

- Added `webapp/src/shared/ui/segmented-button-group.tsx` for non-Radix local state segmented controls.
- Migrated Debts filter buttons (`Все / Я должен / Мне должны`) to `SegmentedButtonGroup`.
- Added `webapp/src/shared/ui/form-page-header.tsx` for form/detail pages outside the bottom-nav layout.
- Migrated Add Transaction, Add Budget, and Add Debt headers to `FormPageHeader` including guest states.
- Exported new primitives from `webapp/src/shared/ui/index.ts`.

### Verification

Hermes ran:

```bash
npm run build:webapp
npm run verify
node /tmp/ft028_ui_audit_capture.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Screenshot metrics show list page headers remain aligned at x=16 and form headers start at x=68 after the back button, consistently across add pages.

### Next

FT-029D should normalize empty-state variants and audit form submit visibility with keyboard-open / small-height mobile screenshots.

## 2026-07-22 — FT-029D empty-state dedupe and post-template screenshot audit

### Goal

Continue autonomous design-system stabilization after shared headers/segmented controls by removing duplicated budget empty states and rerunning screenshot checks.

### Changes

- Budget page no longer renders the BudgetOverview empty state when there are no budgets; this removes repeated budget empty states on the same mobile screen.
- Form pages already migrated to `FormPageHeader` were re-audited at mobile 390×844.

### Verification

Hermes ran:

```bash
npm run verify
node /tmp/ft028_ui_audit_capture.js
```

Results:

- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge.
- Screenshot audit confirms budgets/debts list pages have no fixed page-level mobile FABs and form headers align consistently at x=68 after the back button.

### Next

FT-029E should move the screenshot audit script from `/tmp` into the repo as a reusable design QA gate. FT-029F should add keyboard-open/small-height form checks.

## 2026-07-23 — FT-029E reusable mobile screenshot audit gate

### Goal

Continue FT-029 autonomous design-system cleanup by moving the one-off mobile screenshot audit into the repository as a repeatable QA command.

### Changes

- Added `scripts/mobile-ui-audit.js`, a Playwright-based route audit for core mobile Mini App pages.
- Added `npm run design:audit`.
- Added root `playwright` dev dependency so the audit command resolves from project dependencies instead of a Hermes-local cache.
- The script captures screenshots and `metrics.json`, records h1/tab/nav coordinates, and exits non-zero when console errors or bad network responses are detected.

### Verification

Hermes ran:

```bash
npm run build:webapp
BASE_URL=http://127.0.0.1:5175 OUT_DIR=/tmp/ft029e-mobile-ui-audit npm run design:audit
```

Result:

- `npm run build:webapp` passed.
- `npm run design:audit` passed with `issueCount: 0`.
- Audit artifacts:
  - `/tmp/ft029e-mobile-ui-audit/metrics.json`
  - `/tmp/ft029e-mobile-ui-audit/screenshots/*.png`
- 390px metrics confirm: center nav `+` is exactly centered (`centerX=195`, `viewportCenterX=195`), list-page headers remain at `h1.x=16`, and form-page headers remain at `h1.x=68`.

### Full gate

```bash
npm run verify
```

Result: passed — 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-029E. Continue with FT-029F: keyboard-open / small-height form screenshots for Add Transaction/Budget/Debt.

## 2026-07-23 — FT-029F small-height form audit

### Goal

Validate add-form pages on a constrained mobile height as a proxy for Telegram Mini App keyboard-open / small viewport behavior.

### Changes

- Extended `scripts/mobile-ui-audit.js` with `AUTH_MODE=telegram` so authenticated-only forms can be audited without manual browser setup.
- Added `ROUTES=...` filtering for focused design checks.
- Added `SCROLL_TO=bottom` so submit-button visibility can be checked after scrolling.

### Verification

Hermes ran focused form audits against a local Vite app at 390×667:

```bash
BASE_URL=http://127.0.0.1:5175 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=667 AUTH_MODE=telegram ROUTES=/transactions/add,/budgets/add,/debts/add OUT_DIR=/tmp/ft029f-small-height-auth-forms npm run design:audit
BASE_URL=http://127.0.0.1:5175 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=667 AUTH_MODE=telegram ROUTES=/transactions/add,/budgets/add,/debts/add SCROLL_TO=bottom OUT_DIR=/tmp/ft029f-small-height-auth-forms-bottom npm run design:audit
npm run build:webapp
npm run verify
```

Results:

- Both focused `design:audit` runs passed with `issueCount: 0`.
- Top screenshots: `/tmp/ft029f-small-height-auth-forms/screenshots/*.png`.
- Bottom-scroll screenshots: `/tmp/ft029f-small-height-auth-forms-bottom/screenshots/*.png`.
- Metrics confirm form headers remain aligned at `h1.x=68`.
- Bottom-scroll screenshots confirm submit buttons are reachable/usable on Add Transaction, Add Budget, and Add Debt at 390×667.
- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Decision

No immediate form-layout code change was needed in this slice. The reusable audit command is now stronger for future design QA.

## 2026-07-23 — FT-030 stable local Telegram Mini App launch flow

### Goal

Make local Telegram Mini App testing repeatable after the real failure where the backend/tunnel worked but Telegram's persistent menu button still pointed to a dead quick-tunnel URL.

### Root cause from incident

- `WEB_APP_URL` in `.env` had been updated only after the tunnel changed.
- Old inline `/start` buttons keep their embedded `web_app` URL and do not update automatically.
- Telegram's persistent chat menu button is stored separately via Bot API `setChatMenuButton`; it was still pointing at the stale `joel-russia-gcc-jews.trycloudflare.com` URL.

### Changes

- Added `scripts/dev-miniapp.js`.
- Added npm commands:
  - `npm run dev:miniapp -- --chat-id=<telegram_chat_id>`
  - `npm run miniapp:menu -- status --chat-id=<telegram_chat_id>`
  - `npm run miniapp:menu -- set --url=<https_url> --chat-id=<telegram_chat_id>`
- Helper behavior:
  - creates a Cloudflare quick tunnel when no `--url` is supplied;
  - validates Mini App URL is HTTPS;
  - updates ignored local `.env` `WEB_APP_URL`;
  - updates Telegram persistent menu button safely without printing the bot token;
  - can build and start `npm run serve` for stable phone testing;
  - probes the public Mini App URL.
- Updated README and CLAUDE.md with the phone/Mini App testing flow and stale Telegram button caveat.
- Added optional `MINIAPP_CHAT_ID` to `.env.example`.

### Verification so far

Hermes ran:

```bash
node --check scripts/dev-miniapp.js
npm run miniapp:menu -- status --chat-id=131184740
node scripts/dev-miniapp.js run --url=https://mice-adds-growing-surfing.trycloudflare.com --chat-id=131184740 --skip-build --no-serve
npm run build
```

Results:

- Script syntax check passed.
- Status command showed `TG_BOT_API_KEY=present` without printing the secret and verified the current Telegram menu URL.
- Existing-tunnel run updated `.env`, updated Telegram menu button to `https://mice-adds-growing-surfing.trycloudflare.com/?userId=131184740`, and public app probe returned HTTP 200.
- Backend TypeScript build passed.

### Full verification

```bash
npm run verify
```

Result: passed — 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-030.

## 2026-07-23 — FT-031 recorded for later

### Decision

Shukur selected the next product vector after FT-030: daily usage UX. Hermes recorded `FT-031: Daily usage UX audit and cleanup` in `TASKS.md` but did not start implementation, per Shukur's instruction.

### Scope captured

FT-031 will audit and later clean up the everyday finance tracking loop:

- open Mini App from Telegram;
- add expense through bot text;
- add transaction through Mini App;
- view recent transactions;
- edit/delete;
- verify correct Telegram user ownership;
- identify `/start`, button, quick-add, recent-list, and empty/error-state friction.

### Status

- `FT-004` product-vector decision marked `done`.
- `FT-031` added as `backlog`.
- No product implementation started.

## 2026-07-23 — FT-031A daily flow audit + Telegram quick actions

### Goal

Begin FT-031 autonomously by auditing the everyday entry points and applying the first safe daily-use cleanup.

### Audit

Hermes checked the running local Mini App/bot processes, reviewed Telegram command/message/keyboards and key Mini App pages/widgets, and captured mobile screenshots at 390x844.

Screenshot artifacts:

```text
/tmp/ft031a-daily-audit-after/screenshots/home-390.png
/tmp/ft031a-daily-audit-after/screenshots/transactions-390.png
/tmp/ft031a-daily-audit-after/screenshots/add-transaction-390.png
```

Design audit command:

```bash
BASE_URL=https://markets-upc-usb-inquiry.trycloudflare.com AUTH_MODE=telegram TELEGRAM_USER_ID=131184740 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft031a-daily-audit-after ROUTES=/,/transactions,/transactions/add npm run design:audit
```

Result: passed with `issueCount: 0`.

API daily-flow probe:

- create transaction: HTTP 201
- list transactions: HTTP 200 and created transaction found
- update/delete with only `X-Dev-User-Id`: HTTP 403 due `optionalAuth` not accepting the dev header
- audit transaction cleanup: local SQLite cleanup verified count `0`

The 403 is recorded as dev-test friction, not a confirmed real Telegram Mini App blocker, because real Mini App requests use `Authorization: tma <initData>`.

### Changes

- Improved `/start` keyboard from a single generic app button to daily actions:
  - Open app
  - Add transaction
  - All transactions
  - Detailed analytics
- Improved auto-saved transaction keyboard:
  - Edit/Delete remain first
  - Follow-up actions are now All transactions + Add transaction
- Improved repo-local mobile screenshot audit:
  - supports `TELEGRAM_USER_ID` and `TELEGRAM_USER_NAME`
  - injects `X-Dev-User-Id` on `/api/**` when `AUTH_MODE=telegram`, avoiding false 401s in browser screenshot QA

### Verification

```bash
npm run build
npm run verify
```

Result: passed — 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-031A and restart `npm run serve` so the new Telegram keyboard code is active locally.

## 2026-07-23 — FT-031B dev edit/delete auth path

### Goal

Continue FT-031 by removing the daily-flow QA blocker found in FT-031A: direct browser/API edit/delete probes with `X-Dev-User-Id` returned 403 while create/list worked.

### Root cause

The transaction update/delete routes use `optionalAuth`, then verify resource ownership. `requireAuth` supported the local development `X-Dev-User-Id` bypass, but `optionalAuth` did not. Therefore `req.telegramUser` remained unset and ownership verification failed closed for non-guest transactions.

This was a dev-testability bug, not a production auth relaxation: production Telegram Mini App still uses `Authorization: tma <initData>`.

### TDD loop

RED:

```bash
npm run test:ci -- tests/transactionRoutes.test.ts
```

Result before fix: the new regression test failed because update returned 403 instead of 200.

GREEN:

- Added non-production `X-Dev-User-Id` handling to `optionalAuth`, matching `requireAuth` behavior.
- Targeted test passed.

### Live probe after rebuild/restart

Hermes ran a local API daily-flow probe with `X-Dev-User-Id`:

- create: 201
- update: 200
- delete: 200
- list after delete: 200, deleted transaction absent

Temporary FT-031B repro/probe transactions were cleaned from local SQLite; remaining count matched `0`.

### Verification

```bash
npm run verify
```

Result: passed — 18 suites / 167 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Runtime

Backend was rebuilt and restarted so the local Mini App/tunnel can exercise the new auth behavior.

### Next

Commit/push FT-031B. Continue with FT-031C: Mini App recent transactions / add-flow polish.

## 2026-07-23 — FT-031C Mini App recent/add-flow polish

### Goal

Continue FT-031 after the auth/testability slice by making the everyday Mini App loop more useful: recent transactions should be actionable, and the add form should feel less repetitive.

### Changes

- Home `RecentTransactions` card:
  - added a visible `Добавить` button in the card header;
  - changed subtitle to `Нажмите строку, чтобы изменить`;
  - made recent rows clickable to open the edit transaction route;
  - kept the all-transactions link and made its count explicit.
- Dedicated Add Transaction page:
  - removed the duplicate inner `Добавить транзакцию` header below `Новая транзакция`;
  - added `showHeader` prop to `AddTransaction` so the feature can compose cleanly in page contexts.

### Visual QA

Before:

```text
/tmp/ft031c-before/screenshots/home-390.png
/tmp/ft031c-before/screenshots/transactions-390.png
/tmp/ft031c-before/screenshots/add-transaction-390.png
```

After:

```text
/tmp/ft031c-after/screenshots/home-390.png
/tmp/ft031c-after/screenshots/transactions-390.png
/tmp/ft031c-after/screenshots/add-transaction-390.png
/tmp/ft031c-after-bottom/screenshots/home-390.png
```

Focused authenticated audit:

```bash
BASE_URL=https://hoped-physics-partnerships-shares.trycloudflare.com AUTH_MODE=telegram TELEGRAM_USER_ID=131184740 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft031c-after ROUTES=/,/transactions,/transactions/add npm run design:audit
```

Result: `issueCount: 0`.

The add page now fits in the audited 390x844 viewport without the duplicate title block. The Recent Transactions card shows the add action and edit hint; bottom nav remains fixed and centered.

### Verification

```bash
npm run build:webapp
npm run verify
```

Result: passed — 18 suites / 167 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Runtime

Backend was rebuilt and restarted so the current tunnel can serve the updated Mini App bundle.

### Next

Continue with FT-031D: improve Telegram bot response after expense creation.

## 2026-07-29 — FT-031D Telegram saved-transaction response polish

### Goal

Continue the daily-use UX cleanup by making the Telegram bot response after a saved transaction more useful and self-explanatory.

### TDD loop

RED:

```bash
npm run test:ci -- tests/telegramFormatters.test.ts
```

Initial result: the new formatter test failed because the old message omitted the currency label, description line, and next-action hint.

GREEN:

- Added `tests/telegramFormatters.test.ts` coverage for auto-saved and low-confidence confirmation messages.
- Auto-saved transaction messages now render amount/today/month totals with `UZS`.
- Transaction description is shown when available.
- Auto-saved messages now include: `Дальше: можно изменить, удалить или добавить ещё одну транзакцию кнопками ниже.`
- Low-confidence confirmation messages intentionally do not show the next-action hint before confirmation.

Targeted result:

```bash
npm run test:ci -- tests/telegramFormatters.test.ts
```

Passed: 1 suite / 2 tests.

### Verification

```bash
npm run build
npm run verify
```

Result: passed — 19 suites / 169 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-031D. If continuing FT-031, the next likely slice is a real Telegram `/start` / text-add smoke after restarting the local backend so the updated bot formatter is active.

## 2026-07-29 — FT-031E Telegram processing feedback

### Goal

Make Telegram bot input feel responsive immediately after the user sends text or voice. Shukur reported that it was unclear whether the bot received the message or was processing it.

### UX decision

Use Telegram's native `typing` chat action as a lightweight loading indicator instead of sending an extra `⏳ Обрабатываю...` message for every transaction. This avoids clutter while still showing that the bot is alive and processing.

### TDD loop

RED:

```bash
npm run test:ci -- tests/telegramMessageHandlers.test.ts
```

Initial result: failed because the text handler was not exported for direct testing and no processing chat action existed.

GREEN:

- Added `sendProcessingFeedback(ctx)` best-effort helper.
- Text input now sends `typing` before finance parsing.
- Pending quick-add amount flow now sends `typing` before saving.
- Voice input now sends `typing` before file download/transcription processing.
- If Telegram rejects the chat action, processing continues and the user still gets the final success/error response.
- Added `tests/telegramMessageHandlers.test.ts` coverage for action-before-processing and failure-tolerant behavior.

Targeted result:

```bash
npm run test:ci -- tests/telegramMessageHandlers.test.ts
```

Passed: 1 suite / 2 tests.

### Verification

```bash
npm run build
npm run verify
```

Result: passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-031E and restart the local backend so the running Telegram bot picks up the updated handler.

## 2026-07-29 — FT-032 Modern mobile bottom navigation

### Goal

Adapt the modern mobile menu pattern Shukur shared from 21st.dev into the Finance Tracker Mini App bottom navigation, without losing the finance app's existing route structure or central add-transaction affordance.

### Changes

- Added `webapp/src/shared/ui/modern-mobile-menu.tsx` as a shared mobile nav primitive inspired by the 21st.dev interactive menu pattern.
- Replaced the old mobile bottom navigation with a floating rounded pill menu.
- Kept the IA: `Главная | История | + | Бюджеты | Ещё`.
- Kept `+` as the neutral primary action and wired it to the existing controlled `QuickAddSheet`.
- Active route items now expand to show the label and underline, while inactive route items stay icon-focused.
- Added `iconBounce` keyframes and `.animate-icon-bounce` utility in `globals.css`.
- Exported `ModernMobileMenu` from `shared/ui`.

### Visual QA

Focused screenshot audits were run on `/more` to avoid unrelated authenticated API noise and evaluate the nav itself:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft031f-modern-nav-more ROUTES=/more npm run design:audit
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=375 VIEWPORT_HEIGHT=812 OUT_DIR=/tmp/ft031f-modern-nav-375 ROUTES=/more npm run design:audit
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=412 VIEWPORT_HEIGHT=915 OUT_DIR=/tmp/ft031f-modern-nav-412 ROUTES=/more npm run design:audit
```

Results:

- `issueCount: 0` for the focused visual audits.
- Screenshot evidence:
  - `/tmp/ft031f-modern-nav-more/screenshots/more-390.png`
  - `/tmp/ft031f-modern-nav-375/screenshots/more-375.png`
  - `/tmp/ft031f-modern-nav-412/screenshots/more-412.png`
- Center `+` metrics:
  - 375px: `centerX=187.5`, `viewportCenterX=187.5`
  - 390px: `centerX=195`, `viewportCenterX=195`
  - 412px: `centerX=206`, `viewportCenterX=206`
- Visual judgment: the nav reads as a modern floating mobile menu; the center `+` is exactly centered and not overlapped.

### Verification

```bash
npm run build:webapp
npm run verify
```

Result: passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-032 and restart the local backend so the Telegram Mini App serves the updated static bundle.

## 2026-07-29 — FT-033 Dock-style mobile bottom navigation

### Goal

Replace the previous expanding bottom navigation with the new 21st.dev dock reference Shukur provided: compact, icon-only, floating, with separators and an active pill.

### Changes

- Added `webapp/src/shared/ui/dock.tsx` with `Dock`, `DockItem`, and `DockSeparator`.
- Installed `motion` in the webapp to support the active-pill layout animation from the reference component.
- Rewired `BottomNav` to use the dock pattern instead of `ModernMobileMenu`.
- Preserved the Finance Tracker IA: `Главная | История | + | Бюджеты | Ещё`.
- Kept the central `+` as the global Quick Add entry point via `ControlledQuickAddSheet`.
- Preserved symmetric nav layout around the center action: `2 route icons | separator | + | separator | 2 route icons`.
- Removed the unused `modern-mobile-menu.tsx` export/component.

### Verification

Focused structural RED/GREEN check:

```bash
test -f webapp/src/shared/ui/dock.tsx && grep -q 'export function Dock' webapp/src/shared/ui/dock.tsx && grep -q 'DockItem' webapp/src/shared/ui/bottom-nav.tsx
```

- Before implementation: failed, because dock did not exist.
- After implementation: passed.

Build and full gate:

```bash
npm run build:webapp
npm run verify
```

Result: passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

Note: adding `motion` increased the main webapp chunk enough to trigger Vite's `Some chunks are larger than 600 kB` warning. The build still succeeds.

### Visual QA

Focused `/more` audits passed with `issueCount: 0`:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=375 VIEWPORT_HEIGHT=812 OUT_DIR=/tmp/ft033-dock-nav-375 ROUTES=/more npm run design:audit
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft033-dock-nav-390 ROUTES=/more npm run design:audit
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=412 VIEWPORT_HEIGHT=915 OUT_DIR=/tmp/ft033-dock-nav-412 ROUTES=/more npm run design:audit
```

Screenshot evidence:

- `/tmp/ft033-dock-nav-375/screenshots/more-375.png`
- `/tmp/ft033-dock-nav-390/screenshots/more-390.png`
- `/tmp/ft033-dock-nav-412/screenshots/more-412.png`

Center `+` metrics:

- 375px: `centerX=187.5`, `viewportCenterX=187.5`
- 390px: `centerX=195`, `viewportCenterX=195`
- 412px: `centerX=206`, `viewportCenterX=206`

Visual judgment: the dock is much closer to the provided reference than the prior expanding nav. It is compact, balanced, and the central `+` is exactly centered. It is a little more visually “techy” than a standard tab bar, but still acceptable for the current clean finance UI.

### Next

Commit/push FT-033 and restart the local backend so the Telegram Mini App serves the updated static bundle.

## 2026-07-29 — FT-034 Typography foundation cleanup

### Goal

Review and improve the Mini App typography after Shukur reported that the current font felt inconsistent — “как будто все по разному”.

### Findings

- The app used Inter, but only loaded weights `400`, `600`, `700`.
- Many components use `font-medium` (`500`), so the browser had to synthesize that weight or approximate it.
- The screenshots showed perceived inconsistency around:
  - very heavy page titles vs softer subtitles;
  - `font-medium`/`font-semibold`/`font-bold` mixed across cards and empty states;
  - large money amounts using heavy display scale;
  - random small sizes like `text-[11px]` and `text-[0.8rem]`.

### Recommendation

Use a Cyrillic-friendly UI font as the base and make this a two-step typography cleanup:

1. **Foundation now:** replace the font family and make all common weights real.
2. **Component scale later:** standardize `PageHeader`, `CardTitle`, body/caption, and money amount classes.

I chose **Onest** for the foundation because it is readable in Russian, feels softer than Inter, and suits a personal finance assistant better than a colder developer/SaaS font.

### Changes

- Switched the webapp Google Font from Inter to Onest:
  - `Onest:wght@400..800`
- Updated `--font-family-sans` in `globals.css`.
- Updated TypeScript design tokens to mirror Onest and expose weights `400`, `500`, `600`, `700`, `800`.
- Added base rendering improvements:
  - `text-rendering: optimizeLegibility`
  - `font-synthesis-weight: none`
- Tightened heading rhythm:
  - `line-height: 1.12`
  - `letter-spacing: -0.025em`

### Visual QA

Baseline screenshots before change:

- `/tmp/ft034-font-audit/screenshots/home-390.png`
- `/tmp/ft034-font-audit/screenshots/transactions-390.png`
- `/tmp/ft034-font-audit/screenshots/more-390.png`

Post-change screenshots:

- `/tmp/ft034-onest-fonts/screenshots/home-390.png`
- `/tmp/ft034-onest-fonts/screenshots/transactions-390.png`
- `/tmp/ft034-onest-fonts/screenshots/more-390.png`

Focused audit command:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft034-onest-fonts ROUTES=/,/transactions,/more npm run design:audit
```

Result: `issueCount: 0`.

Visual judgment: Onest makes the UI feel more cohesive and Cyrillic-native. The biggest remaining typography inconsistency is no longer the font family; it is component-level type scale usage.

### Verification

Font availability:

```bash
python3 - <<'PY'
import urllib.request
url='https://fonts.googleapis.com/css2?family=Onest:wght@400..800&display=swap'
with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=20) as r:
    text=r.read().decode('utf-8')
print('Onest CSS status OK, @font-face count:', text.count('@font-face'))
PY
```

Result: `Onest CSS status OK, @font-face count: 5`.

Build and full gate:

```bash
npm run build:webapp
npm run verify
```

Result: passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-034 and restart the local backend so the Telegram Mini App serves the updated static bundle.

## 2026-07-29 — FT-035 Mobile design-system cleanup

### Goal

Fix the visually heavy BalanceCard block and establish a small shared mobile design-system layer so typography, spacing, cards, and finance amounts stop drifting screen-by-screen.

### Design review findings

The user-provided BalanceCard screenshot looked unpolished because:

- the main amount was too large and visually aggressive;
- `UZS` used the same visual weight as the amount;
- income/expense actions were too tall and heavy, with loud outlines;
- income/expense monthly stats were visually loose instead of structured;
- page/card spacing was inconsistent across Home, Transactions, Budgets, and More;
- fixed bottom dock could visually collide with scrolled content underneath.

### Changes

- Added shared primitives in `webapp/src/shared/ui/typography.tsx`:
  - `PageShell`
  - `SectionStack`
  - `AmountText`
  - `MetricStat`
- Exported the new primitives from `webapp/src/shared/ui/index.ts`.
- Refined `webapp/src/shared/ui/card.tsx` defaults:
  - calmer `rounded-3xl` cards;
  - consistent border/shadow;
  - tighter header/content padding;
  - consistent `CardTitle` / `CardDescription` scale.
- Refined `webapp/src/shared/ui/page-header.tsx`:
  - consistent mobile title scale;
  - subtitle rhythm and line-height.
- Rebuilt `webapp/src/widgets/balance-card/ui/BalanceCard.tsx`:
  - `Чистый поток` header with month pill;
  - amount in a muted metric panel;
  - smaller `UZS` suffix via `AmountText`;
  - compact income/expense action row;
  - equal two-column monthly stats via `MetricStat`.
- Applied shared shells/rhythm to:
  - `HomePage`
  - `TransactionsPage`
  - `BudgetsPage`
  - `MorePage`
- Refined `QuickStats` numeric cards to match the same scale.
- Added a bottom-nav gradient scrim in `BottomNav` so the fixed dock does not visually fight with content behind it.

### Visual QA

Screenshot audit passed for `/`, `/transactions`, `/budgets`, `/more` at 375, 390, and 412 px.

Final 390 px screenshots:

- `/tmp/ft035-system-final-390/screenshots/home-390.png`
- `/tmp/ft035-system-final-390/screenshots/transactions-390.png`
- `/tmp/ft035-system-final-390/screenshots/budgets-390.png`
- `/tmp/ft035-system-final-390/screenshots/more-390.png`

Metrics:

- `issueCount: 0`
- bottom dock center button at 390 px: `centerX=195`, `viewportCenterX=195`

Visual judgment:

- BalanceCard is significantly calmer and more structured than the original screenshot.
- Header, card, and stat spacing now feel more intentional.
- Transactions and More pages share the same left inset, title scale, and bottom nav behavior.
- Remaining subjective follow-up: GuestModeBanner is still visually large, and deeper entities (`BudgetCard`, `DebtCard`, `TransactionListItem`, form pages, `EmptyState`) can be standardized in a second slice.

### Verification

```bash
npm run build:webapp
npm run verify
```

Result: passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, and madge circular scan.

### Next

Commit/push FT-035 and restart the local backend so the Telegram Mini App serves the updated static bundle.

## 2026-07-29 — FT-036 Claude-assisted UI design-system audit and shell cleanup

### Goal

Use Claude Code as a dedicated UI audit/implementation agent for a deeper design-system pass, while Hermes remains reviewer and QA gatekeeper.

### Claude audit

Claude Code ran a deep static audit across `webapp/src/shared/ui`, pages, widgets, entities, and features.

Audit artifact:

- `.hermes/plans/2026-07-29-ui-design-system-audit.md`

Key findings:

- P0: `PageShell` created nested `<main>` landmarks when used inside `Layout` and stacked its `pb-28` with `Layout` bottom padding.
- P1: page root wrappers had drifted into four patterns: core tabs, legacy containers, form pages, and fully hand-rolled detail/edit pages.
- P1: `FormPageHeader` adoption was incomplete: add pages used it, edit/detail pages still hand-rolled equivalent headers.
- P1/P2 follow-ups: hardcoded debt/premium colors, global card-radius mismatch, stale design docs.

### Implementation

Claude Code implemented the first safe slice. Hermes then manually resolved the remaining `DebtDetailsPage` build issue and addressed the independent reviewer’s accessibility concern.

Changed:

- `PageShell` now supports `as?: 'div' | 'main'`:
  - default `div` for pages rendered inside `Layout`;
  - `as="main"` for standalone form/detail routes.
- Removed extra `PageShell pb-28`; `Layout` remains the single owner of dock-clearance bottom padding.
- Migrated wrapper patterns in:
  - `DebtsPage`
  - `AnalyticsPage`
  - `AddTransactionPage`
  - `AddBudgetPage`
  - `AddDebtPage`
  - `EditTransactionPage`
  - `EditBudgetPage`
  - `DebtDetailsPage`
- Replaced hand-rolled edit/detail headers with `FormPageHeader`.
- Standardized `FormPageHeader` typography to match `PageHeader`.

### Review

Independent Claude diff review flagged two potential blockers around `PageShell` semantics and bottom padding. Hermes verified and addressed them:

- Main/core routes are inside `Layout`, so `PageShell` must not render a second `<main>` there.
- Standalone form/detail routes now use `PageShell as="main"`, so they keep a landmark.
- Bottom-nav clearance remains owned by `Layout`; visual audit showed no dock/content collision.

### Verification

Build and full gate:

```bash
npm run build:webapp
npm run verify
```

Result:

- 20 suites / 171 tests passed.
- backend build passed.
- webapp build passed.
- dependency-cruiser passed.
- madge circular scan passed.

Screenshot QA:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft036-claude-system-final-390 ROUTES=/,/transactions,/budgets,/more,/debts,/analytics,/transactions/add,/budgets/add,/debts/add npm run design:audit
```

Also repeated at 375 and 412 px.

Result:

- `issueCount: 0` at 375/390/412 px.
- `mainCount=1` on all audited routes.
- core nav routes: `navPresent=true`.
- standalone form routes: `navPresent=false`.

Screenshots:

- `/tmp/ft036-claude-system-final-390/screenshots/home-390.png`
- `/tmp/ft036-claude-system-final-390/screenshots/debts-390.png`
- `/tmp/ft036-claude-system-final-390/screenshots/add-debt-390.png`

### Next

Commit/push FT-036 and restart backend runtime.

## 2026-07-29 — FT-037 Close remaining design-system audit findings

### Goal

Close the remaining Claude audit follow-ups: semantic token cleanup, standard card radius, and stale design-system docs. Claude Code performed the main implementation; Hermes reviewed, fixed missed cases, verified, and shipped.

### Claude implementation

Claude Code was asked to implement:

- Semantic color cleanup in:
  - `DebtCard.tsx`
  - `DebtDetailsPage.tsx`
  - `PremiumBadge.tsx`
  - `PremiumStatusCard.tsx`
- Shared `Card` radius alignment with documented standard card radius.
- Docs cleanup for stale design-system references.

Claude reached max turns but produced a valid diff and `npm run build:webapp` passed.

### Hermes review and fixes

Hermes review found remaining raw `amber-*` direct palette classes in:

- `PremiumBadge.tsx`
- `UsageBar.tsx`
- `PremiumStatusCard.tsx`

Hermes converted them to semantic tokens:

- warning/progress/trial state → `warning` / `warning-muted`
- paid Premium badge → `secondary`
- destructive/overdue debt state → `destructive`

Independent Claude diff review found no blockers. It suggested preserving visual distinction between paid Premium and Trial, so Hermes changed paid Premium to neutral/secondary while keeping Trial warning.

### Changes

- Default shared `Card` radius changed from `rounded-3xl` to `rounded-2xl`.
- Raw product UI palette classes removed from `webapp/src/**/*.tsx` for audited color families.
- Stale design-system docs rewritten/updated:
  - `CLAUDE.md`
  - `docs/DESIGN_SYSTEM_SUMMARY.md`
  - `docs/knowledge-base/08-development/design-system.md`
  - `webapp/README.md`
- Updated TASKS with FT-037 summary.

### Verification

```bash
npm run verify
```

Result:

- 20 suites / 171 tests passed.
- backend build passed.
- webapp build passed.
- dependency-cruiser passed.
- madge circular scan passed.

Raw class search:

```bash
search webapp/src/**/*.tsx for direct palette classes
```

Result: zero matches for direct red/purple/violet/pink/lime/amber/orange/yellow/green/blue/etc. product classes.

Screenshot QA:

- 375 px: `issueCount: 0`
- 390 px: `issueCount: 0`
- 412 px: `issueCount: 0`

Routes audited:

- `/`
- `/transactions`
- `/budgets`
- `/more`
- `/debts`
- `/analytics`
- `/transactions/add`
- `/budgets/add`
- `/debts/add`

Final screenshot examples:

- `/tmp/ft037-design-system-closeout-390/screenshots/home-390.png`
- `/tmp/ft037-design-system-closeout-390/screenshots/debts-390.png`
- `/tmp/ft037-design-system-closeout-390/screenshots/add-debt-390.png`

### Visual judgment

- Home still looks polished after `Card` radius reduced to `rounded-2xl`; the UI feels slightly cleaner and less inflated.
- Debts/add-debt pages remain consistent with the unified shell/header system.
- No dock/content collision was observed.
- Premium/trial colors no longer use raw palettes and still remain distinguishable.

### Next

Commit/push FT-037 and restart backend runtime.

## 2026-07-31 — Autonomous pre-redesign continuation started

### Goal

Continue autonomously with Claude Code as implementation developer and Hermes as QA gatekeeper. Focus is no longer broad design polish; it is preparing the product foundation for redesign: semantic trust, needs-review, correction contracts, and weekly-review primitives.

### Latest design artifact

Received and extracted latest Claude Design artifact:

- Source: `/home/shukur/.hermes/cache/documents/doc_3c2e5d5c979a_Telegram Finance Tracker Prototype.zip`
- Extracted: `/tmp/claude-design-finance-latest/`
- Main file: `/tmp/claude-design-finance-latest/Finance Tracker.dc.html`

Relevant product cues from artifact:

- `Нужно проверить` is a trust feature, not an error.
- Uncertain transactions should stay out of final totals until corrected.
- Correction chips should update semantic type and teach future similar operations.
- Group payments should count only the user's share later; full amount should not inflate real expenses.

### Planned autonomous sequence

1. FT-SEM-001 — add `needsReview` foundation.
2. FT-SEM-002 — add semantic correction foundation.
3. FT-SEM-003 — add weekly review foundation.
4. FT-SEM-004 — final verify + redesign readiness report.

### Constraints

- Claude Code may implement but must not commit/push/deploy/edit env/print secrets.
- Hermes reviews diff and runs focused tests + `npm run verify` before each commit.
- Supabase migration files may be created, but migrations are not executed without explicit approval.

## 2026-07-31 — FT-SEM-001 needsReview foundation completed

### Goal

Add `needsReview` as the trust/correction foundation before redesign. Uncertainty is represented as `needsReview: true`, not by adding an `unknown` semantic type.

### Execution

Claude Code implemented most of the slice but exited with `error_max_turns`. Hermes inspected the partial diff, fixed missing voice/text propagation and parser normalization, updated the OpenAI prompt contract, then ran focused and full verification.

### Files changed

- `migrations/008_add_transaction_needs_review.sql`
- `src/modules/transaction/**` domain/application/controller/repository mapping files
- `src/modules/voiceProcessing/**` parsed transaction, text/voice flow, OpenAI response parser
- `src/shared/application/validation/**`
- `src/shared/domain/constants/messages.ts`
- `src/shared/infrastructure/database/entities/Transaction.ts`
- focused tests for create/update/routes/text/voice semantic parsing

### Verification

```bash
npm test -- tests/transactionRoutes.test.ts tests/semanticTransactionParsing.test.ts tests/processTextInput.test.ts tests/createTransaction.test.ts tests/updateTransaction.test.ts --runInBand
```

Result: passed — 5 suites / 37 tests.

```bash
npm run verify
```

Result: passed — 23 suites / 213 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

### Notes

- Supabase migration file was created but not executed.
- `needsReview` defaults to false when omitted or non-boolean in parser normalization.
- OpenAI prompt now explicitly asks for `needsReview` and forbids inventing `unknown` semanticType.

## 2026-07-31 — FT-SEM-002 semantic correction foundation completed

### Goal

Prepare current Mini App for redesign by wiring `needsReview` into frontend transaction types, local/server mapping, view model, search, and a minimal correction-chip UI.

### Execution

Claude Code implemented the slice and exited with `error_max_turns`, but the resulting diff was self-contained and verified green by Hermes. Per Shukur's direction, Hermes did not manually modify code after this Claude run.

### Files changed

- `webapp/src/shared/types/transaction.ts`
- `webapp/src/shared/lib/db/schema.ts`
- `webapp/src/shared/lib/db/dataSource.ts`
- `webapp/src/entities/transaction/api/{queries,mutations}.ts`
- `webapp/src/entities/transaction/lib/{semanticType,toViewModel}.ts`
- `webapp/src/entities/transaction/model/types.ts`
- `webapp/src/entities/transaction/ui/TransactionCard.tsx`
- `webapp/src/features/filter-transactions/lib/filterTransactions.ts`

### Verification

```bash
npm run build:webapp
```

Result: passed.

```bash
npm run verify
```

Result: passed — 23 suites / 213 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

### Notes

- This is a minimal functional correction foundation, not final redesign.
- `TransactionCard` shows `Нужно проверить` and semantic correction chips when `_needsReview` is true.
- Clicking a chip uses the existing update mutation to send `{ semanticType, needsReview: false }`.

## 2026-07-31 — FT-SEM-003 weekly review foundation completed

### Goal

Create a backend/application weekly review summary primitive that can power the future redesign without implementing UI, Telegram scheduling, or Obsidian export yet.

### Execution

Claude Code created `summarizeWeeklyReview()` and focused tests. Hermes reviewed the diff and found that `needsReview` transactions were initially included in categorized totals. Per Shukur's direction, Hermes did not patch code manually; a narrow Claude Code continuation fixed the behavior.

### Files changed

- `src/modules/transaction/application/weeklyReviewService.ts`
- `tests/weeklyReviewService.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Behavior

Weekly summary now separates:

- finalized real expenses;
- finalized income;
- excluded/non-expense movements by semantic type;
- needs-review transactions as a separate trust queue;
- top categories from finalized real expenses only.

Transactions with `needsReview === true` are excluded from real expenses, income, excluded movement totals, and top categories until corrected.

### Verification

```bash
npm test -- tests/weeklyReviewService.test.ts --runInBand
```

Result: passed — 1 suite / 8 tests.

```bash
npm run build
```

Result: passed.

```bash
npm run verify
```

Result: passed — 24 suites / 221 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

## 2026-07-31 — FT-SEM-004/005 redesign readiness closed

### Goal

Close the pre-redesign gate after weekly review foundation by checking consistency gaps and verifying the current Mini App can still open.

### Execution

Claude Code ran a read-only readiness QA and wrote `/tmp/finance-redesign-readiness-report.md`. It found two non-migration consistency gaps:

1. English AI prompt omitted `needsReview` instructions.
2. Analytics/budget/Home finalized totals still counted `needsReview` transactions.

Hermes delegated both fixes back to Claude Code in small slices. Claude Code added RED tests for analytics/budget, implemented backend exclusions, updated HomeTrustSummary, and updated the English prompt. Hermes did not manually implement code in these slices; Hermes reviewed diffs and ran verification.

### Files changed

- `src/modules/transaction/application/analyticsService.ts`
- `src/modules/budget/application/budgetService.ts`
- `src/shared/domain/constants/messages.ts`
- `webapp/src/widgets/home-trust-summary/ui/HomeTrustSummary.tsx`
- `tests/analytics.test.ts`
- `tests/budget.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm test -- tests/analytics.test.ts tests/budget.test.ts tests/dashboardService.test.ts tests/weeklyReviewService.test.ts --runInBand
```

Result: passed — 4 suites / 51 tests.

```bash
npm run verify
```

Result: passed — 24 suites / 227 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Mini App tunnel/menu check:

- `root:200`
- `health:200`
- `menu.type=web_app`
- URL: `https://employers-nasa-wondering-pointing.trycloudflare.com/?userId=131184740`

### Remaining non-code gate

Local `.env` currently uses `DATABASE_TYPE=sqlite`, so Supabase migrations 007/008 are not a local redesign blocker. Before any Supabase/prod run, migrations 007 and 008 must be applied/confirmed explicitly.

### Redesign readiness verdict

Ready for redesign on local/dev code foundation. The next safe redesign slice is visual redesign of transaction list/cards and Home summary using existing `semanticType`, `needsReview`, correction chips, and weekly-review summary foundation.

## 2026-07-31 — FT-SEM-006 semantic transaction list UI slice

### Goal

Start actual semantic redesign with the transaction list/card vertical slice after pre-redesign foundation was green.

### Execution

Hermes scoped a narrow UI task and delegated implementation to Claude Code. Claude Code added semantic badges and one-tap correction chips to transaction rows and extracted a shared `TransactionCorrectionChips` component. Hermes reviewed the diff, ran build/verify, then performed screenshot-backed mobile visual QA with seeded guest transactions at 375, 390, and 412 px.

Hermes found one visual/product issue in the first pass: non-expense movements such as own transfers and saving deposits still rendered large red negative amounts because `_amountColor` was based only on `type: 'expense'`. Hermes delegated a smaller continuation to Claude Code, which centralized the fix in the transaction view-model mapper: non-expense movements now use neutral `text-muted-foreground` while real expenses stay `text-expense` and income stays `text-income`.

### Files changed

- `webapp/src/entities/transaction/lib/toViewModel.ts`
- `webapp/src/entities/transaction/model/types.ts`
- `webapp/src/entities/transaction/ui/TransactionCard.tsx`
- `webapp/src/entities/transaction/ui/TransactionCorrectionChips.tsx`
- `webapp/src/entities/transaction/ui/TransactionListItem.tsx`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm run build:webapp
```

Result: passed. Vite emitted the existing >600 kB chunk-size warning only.

```bash
npm run verify
```

Result: passed — 24 suites / 227 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Local server probe:

- `root:200`
- `health:200`

Screenshot QA artifacts:

- `/tmp/ft-semantic-transaction-ui-sample/transactions-375.png`
- `/tmp/ft-semantic-transaction-ui-sample/transactions-390.png`
- `/tmp/ft-semantic-transaction-ui-sample/transactions-412.png`
- `/tmp/ft-semantic-transaction-ui-sample/metrics.json`

Metrics summary: 4 semantic rows rendered at each width, 0 console errors, 0 bad responses.

### Visual verdict

Ready to commit. Rows now communicate: real expense red, own transfer/deposit neutral, semantic badges visible, `needsReview` badge visible, correction chips present and wrapped. At 375 px some long descriptions truncate as expected, but no clipping/blocker was observed.

## 2026-07-31 — FT-026 recurring budget periods

Status: done.

What changed:
- Added current recurring budget period calculation from the original `startDate` anchor.
- Budget spending recalculation now uses the current cycle range instead of the stale stored fixed range.
- Budget summaries include the current cycle `startDate`/`endDate`; Mini App budget cards show the current period label.
- Added regression coverage for monthly rollover/reset: February recalculation excludes January transactions.

Verification:
- `npm test -- tests/budget.test.ts --runInBand` — passed.
- `npm run build:webapp` — passed.
- `npx tsc --noEmit` — passed.
- `npm run verify` — passed: 24 suites / 229 tests, backend build, webapp build, dependency-cruiser, madge.


## 2026-07-31 — FT-038 semantic text-input fast paths

### Goal

Improve the daily Telegram text flow so obvious single-amount operations are classified semantically before falling back to OpenAI.

### Execution

Hermes scoped FT-038A/B as a semantic parser acceptance slice. Claude Code was attempted after the user reported the subscription should work, but the print-mode process produced no output for several minutes and was killed to avoid a stuck concurrent editor. Hermes continued directly with TDD and QA.

The implementation adds a conservative `parseObviousSemanticTransaction` fast path before the existing simple expense parser. It classifies only unambiguous single-amount phrases:

- `перевел 500000 на Alif` → `own_transfer`
- `положил 2000000 на вклад` → `saving_deposit`
- `снял наличку 1000000` → `cash_withdrawal`
- `зарплата 7000000` → `income`

Ambiguous or higher-risk text still falls through to OpenAI, including group-payment examples like `оплатил за всех ужин 400000` and debt-language examples like `занял у друга 50000`.

### Files changed

- `src/modules/voiceProcessing/application/processTextInput.ts`
- `tests/processTextInput.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm test -- tests/processTextInput.test.ts tests/semanticTransactionParsing.test.ts --runInBand
```

Result: passed — 2 suites / 25 tests.

```bash
npx tsc --noEmit
```

Result: passed.

```bash
npm run verify
```

Result: passed — 24 suites / 235 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Runtime smoke against the active Cloudflare tunnel called `/api/voice/text-input` with the four fast-path examples above. Each returned the expected `semanticType`/`type`/`needsReview: false`, and Hermes deleted all temporary transactions afterward.


## 2026-07-31 — FT-039 Telegram semantic confirmation UX

### Goal

Make the semantic meaning visible in Telegram confirmations, not only in the Mini App, and prevent Telegram daily/month totals from counting transfers/needs-review movements as real expenses.

### Execution

Hermes continued with a small UX-correctness slice after FT-038. The transaction formatter now maps `semanticType` to Russian labels and explanatory hints. Non-expense movements explicitly say they do not count as expenses. `needsReview` transactions tell the user to check/correct them in the Mini App.

The Telegram text handler's summary calculation now uses `normalizeSemanticType` + `countsAsRealExpense` and skips `needsReview`, aligning Telegram totals with analytics/budget/weekly-review semantics.

### Files changed

- `src/delivery/messaging/telegram/formatters/transactionFormatter.ts`
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts`
- `src/delivery/messaging/telegram/types/index.ts`
- `tests/telegramFormatters.test.ts`
- `tests/telegramMessageHandlers.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm test -- tests/telegramFormatters.test.ts tests/telegramMessageHandlers.test.ts --runInBand
```

Result: passed — 2 suites / 7 tests.

```bash
npx tsc --noEmit
```

Result: passed.

```bash
npm run verify
```

Result: passed — 24 suites / 238 tests, backend build, webapp build, dependency-cruiser, and madge circular check.


## 2026-07-31 — FT-040 Home semantic monthly summary consistency

### Goal

Make Home's top-level monthly numbers consistent with the semantic accounting model: finalized real expenses exclude own transfers, saving deposits, cash withdrawals, debts/reimbursements/group payments, and needs-review rows.

### Execution

Hermes added a tested `calculateHomeTrustSummary` helper for the Home trust card. The widget now shows the explicit formula:

```text
Исходящие операции − Не расходы − Нужно проверить = Реальные расходы
```

`needsReview` rows are deducted separately and surfaced with an action hint to correct them in Mini App.

During visual QA Hermes found a related consistency gap: the BalanceCard said `Месяц`, but `useDashboardInsights` fetched dashboard data without a date range, so the card could show all-time totals. Hermes added a tested current-month range helper and passes `startDate`/`endDate` to the dashboard endpoint.

Hermes also found legacy local data where old income rows had `type: income` but stale `semanticType: expense`. `normalizeSemanticType('expense', 'income')` now coerces to `income`, preventing old income rows from being treated as expenses at read/calculation time.

### Files changed

- `src/modules/transaction/domain/transactionSemanticType.ts`
- `tests/transactionSemanticType.test.ts`
- `webapp/src/entities/dashboard/api/monthRange.ts`
- `webapp/src/entities/dashboard/api/queries.ts`
- `webapp/src/widgets/home-trust-summary/lib/calculateHomeTrustSummary.ts`
- `webapp/src/widgets/home-trust-summary/ui/HomeTrustSummary.tsx`
- `tests/dashboardMonthRange.test.ts`
- `tests/homeTrustSummary.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm test -- tests/homeTrustSummary.test.ts tests/dashboardMonthRange.test.ts --runInBand
npm test -- tests/transactionSemanticType.test.ts tests/homeTrustSummary.test.ts tests/dashboardMonthRange.test.ts --runInBand
npm run verify
```

Result: passed — full verify reported 26 suites / 243 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Runtime probes after restart:

- `local /api/health` — 200
- `public /api/health` — 200
- Dashboard month query returned `totalIncome: 7399999`, `totalExpense: 1011999`, `netIncome: 6388000` for July 2026.

Visual QA:

- `/tmp/ft040-home-final-audit/screenshots/home-390.png`
- `issueCount: 0`, no console errors, no bad responses.
- The screenshot shows BalanceCard and HomeTrustSummary aligned: `Расходы 1 011 999`, formula `1 511 999 − 500 000 = 1 011 999`, and net flow `+6 388 000`.


## 2026-07-31 — FT-041 Telegram weekly review command

### Goal

Expose the semantic weekly review foundation through Telegram so the user can request a Russian summary of the previous week without opening the Mini App.

### Execution

Hermes added a previous-week range helper (`getPreviousWeekRange`) and Telegram formatter (`formatWeeklyReviewSummary`). `registerCommandHandlers` now registers both `/week` and `/weekly`.

The command resolves the Telegram id to the internal UUID, loads the user's transactions, summarizes the previous full ISO-style week (Monday through Sunday), and replies in Russian with:

- real expenses;
- income;
- excluded movements (`own_transfer`, `saving_deposit`, `debt`, `reimbursement`, `cash_withdrawal`, `group_payment`);
- `needsReview` count/total;
- top real-expense categories;
- a next-action hint to open Mini App for corrections/details.

The start/help text now lists `/week`.

### Files changed

- `src/modules/transaction/application/weeklyReviewService.ts`
- `src/delivery/messaging/telegram/formatters/statsFormatter.ts`
- `src/delivery/messaging/telegram/formatters/index.ts`
- `src/delivery/messaging/telegram/handlers/commandHandlers.ts`
- `src/delivery/messaging/telegram/i18n/ru.ts`
- `tests/weeklyReviewService.test.ts`
- `tests/weeklyReviewFormatter.test.ts`
- `tests/telegramWeeklyCommand.test.ts`
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

### Verification

```bash
npm test -- tests/weeklyReviewService.test.ts tests/weeklyReviewFormatter.test.ts tests/telegramWeeklyCommand.test.ts tests/telegramBot.test.ts --runInBand
```

Result: passed — 4 suites / 17 tests.

```bash
npx tsc --noEmit
```

Result: passed.

```bash
npm run verify
```

Result: passed — 28 suites / 249 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

## 2026-08-16 — Task board refresh after pulling Shukur/Claude Code updates

### Goal

Refresh the local project task board after Shukur continued development with Claude Code, then integrate the newer remote task plan without overwriting it.

### Discovery

- Remote `origin/main` had newer task-board commits; initial push was rejected and Hermes rebased onto `origin/main`.
- The newer `TASKS.md` already contained a more current relaunch plan from 2026-08-12/13, including cancellation of the AWS/prod-focused slices and completion of FT-065/FT-066.
- During conflict resolution, Hermes kept the newer active plan and did **not** resurrect the stale July backlog suggestions.
- Repo-local `tmp/mobile-ui-audit/` screenshot artifacts were the only noisy local untracked files; they are now ignored by `.gitignore`.

### Changes

- Added a 2026-08-16 revision note to the active plan in `TASKS.md` explaining that `origin/main` is the newer source of truth.
- Confirmed the immediate task order remains the active relaunch plan: `FT-067`, `FT-068`, then `FT-043..FT-045`.
- Added `tmp/` to `.gitignore` for local QA artifacts.

### Verification

Pre-rebase verification on the local base:

```bash
npm run verify
```

Result: passed — 28 suites / 249 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Post-rebase verification:

```bash
npm run verify
```

Result: passed — 29 backend Jest suites / 253 tests, 1 webapp Vitest suite / 4 tests, backend build, webapp build, dependency-cruiser, and madge circular check.

Note: the first post-rebase verify exposed that `webapp/node_modules` was stale/missing `vitest`; `cd webapp && npm install` restored local dependencies without package file changes, then verify passed.

## 2026-08-16 — Board and LLM operating context pinned

### Goal

Make the project direction unambiguous for Hermes/Claude Code/LLM agents before implementation resumes.

### Input

- Shukur asked to review the task board together and actively use Claude Code after upgrading the subscription.
- Claude Code Max was used for an independent read-only review of `TASKS.md`, `CLAUDE.md`, and `package.json`.

### Decisions recorded

- Current source of truth: `TASKS.md` Active Plan, not stale GitHub Issues/Wiki state.
- Current target: local WSL + SQLite + Telegram polling + Cloudflare tunnel; AWS/prod/Supabase are parked unless explicitly approved.
- Current implementation order: `FT-067 → FT-068 → FT-053 → FT-052 → FT-064 → FT-043 → FT-070 → FT-044`.
- Do not run `FT-067` and `FT-068` in parallel because both modify `processTextInput.ts`.
- Product/external-effect tasks remain blocked/frozen until Shukur decides: `FT-054`, `FT-062`, `FT-063`, `FT-069`, `FT-071`, `FT-046`, `FT-048`.

### Changes

- Updated `TASKS.md` milestones, priorities, statuses, and clarification notes for `FT-043`, `FT-052`, `FT-048`, and `FT-049`.
- Added a top-level `Current Operating Mode — READ FIRST` section to `CLAUDE.md` so future Claude Code sessions understand the project goal, source of truth, runtime target, stop conditions, and role split.
- Reconciled stale GitHub-first wording in `CLAUDE.md`: GitHub is secondary until `FT-049`; local FT work should not block on issue creation.
- Updated `CLAUDE.md` verification text to include webapp Vitest and adjusted the design quick reference away from stale Inter/green-accent rules.

### Verification

- `git diff --check` — passed.
- `npm run verify` — passed: backend build, 29 Jest suites / 253 tests, 1 webapp Vitest suite / 4 tests, webapp build, dependency-cruiser, and madge circular check.

## 2026-08-16 — Documentation reconciled with actual repo state

### Goal

Bring project documentation back in line with what the code actually does, after the board and operating context were pinned. Markdown only — no source, package, workflow, env, or generated-asset changes.

### Drift found

- **Module count.** Docs claimed 8 modules including a `DashboardModule`. `createModules()` (`src/appModules.ts`) returns 7: transaction, budget, debt, voice, openAIUsage, user, subscription. `src/modules/dashboard/` holds only `DashboardService` and `DashboardController`; `dashboardModule.ts` does not exist. The dashboard is assembled in the Express layer by `createDashboardRouter()` from `transactionModule.getAnalyticsService()` and `budgetModule.budgetService`.
- **Webapp routes.** Docs advertised `/dashboard` and `/stats`, neither of which exists. Actual routes in `webapp/src/app/router/routes.tsx`: `/`, `/transactions`, `/transactions/add`, `/transactions/:id/edit`, `/budgets`, `/budgets/add`, `/budgets/:id/edit`, `/debts`, `/debts/add`, `/debts/:id`, `/analytics`, `/more`.
- **Deployment.** README/DEPLOYMENT described an automatic SSH deploy on every push. `.github/workflows/deploy.yml` runs `quality-gate` on push, while `deploy` is gated behind `if: github.event_name == 'workflow_dispatch'` since the prod host was parked (FT-047).
- **Quick start.** No mention of the recommended phone/Mini App flow; Docker base image listed as Node 18 Alpine while the Dockerfile uses `node:20-alpine`; `npm run verify` described without `test:webapp`.
- **Logging.** CLAUDE.md carried a hand-maintained category list that had drifted from `LogCategory` in `src/shared/domain/ports/Logger.ts`.

### Changes

- `CLAUDE.md` — 7 app modules + dashboard-is-not-a-module note; dependency diagram corrected; log categories now point at `Logger.ts` as source of truth; wiki table row 8 → 7.
- `README.md` — route table replacing the 5-page/`/dashboard`/`/stats` list; explicit `npm run verify` step list; GitHub Actions section rewritten to describe `quality-gate` vs manual-only `deploy`; module paragraph corrected.
- `USER_GUIDE.md` — web app sections rewritten around real routes (Home, Transactions, Budgets, Debts, Analytics, More); stray "Dashboard"/"Stats" references retargeted.
- `docs/knowledge-base/01-architecture/modules.md` — header, mermaid graph, overview table, and `appModules.ts` snippet corrected; the `DashboardModule` section was replaced by a `UserModule` section (previously undocumented) plus a "Dashboard: сервис, а не модуль" section showing the Express assembly.
- `docs/knowledge-base/01-architecture/overview.md` — module table corrected, dashboard note added.
- `docs/knowledge-base/README.md` — module file list, dependency sketch, and module count corrected; dashboard files listed under a non-module heading.
- `docs/VISION.md` — 8 modules → 7 + dashboard note.
- `docs/knowledge-base/08-development/quick-start.md` — `npm run dev:miniapp -- --chat-id=<id>` documented as the recommended phone/Mini App flow (Cloudflare quick tunnel, `.env` `WEB_APP_URL`, `setChatMenuButton`, no token printing); Docker base image corrected to `node:20-alpine`; `verify` step list includes `test:webapp`; `DB_SYNCHRONIZE` documented exactly as implemented in `database.config.ts` (`DB_SYNCHRONIZE === 'true' || NODE_ENV === 'development'`, read straight from `process.env`, absent from `.env.example`).
- `DEPLOYMENT.md` — "not the active path" banner; verification section uses `npm run verify`; GitHub Actions section describes both jobs and how to restore automatic deploys.
- `PROJECT_DOCUMENTATION.md`, `AUDIT.md`, `SUPABASE_MIGRATION.md` — historical / not-active banners pointing at `TASKS.md` and `CLAUDE.md`; no content deleted. The Supabase banner restates that SQL/migrations need explicit permission.
- `docs/knowledge-base/10-design-guidelines/design-guidelines.md` — note that the current implementation wins where this file conflicts, naming the Inter-vs-Onest and accent-color conflicts, reconciliation tracked as FT-059. Onest and the neutral + semantic color direction were kept as current; nothing reverted to Inter/green-primary.
- `webapp/README.md` — old `webapp-v2`/`public/webapp-v2`/React 18/Vite 5 text replaced with current React 19, Vite 7, real routes, build path `../public/webapp/`, and Mini App notes.
- `docs/BACKEND_STANDARDS.md` — future recommendation no longer says to create `DashboardModule`; dashboard remains service/controller unless a new architecture decision is made.
- `TASKS.md` — docs-reconciliation note in the Active Plan; implementation queue untouched.

### Verification

- `git diff --check` — passed.
- `npm run verify` — passed: backend build, 29 Jest suites / 253 tests, 1 webapp Vitest suite / 4 tests, webapp build, dependency-cruiser, and madge circular check.

### Known caveats

- Historical files (`AUDIT.md`, `PROJECT_DOCUMENTATION.md`, `SUPABASE_MIGRATION.md`) still contain stale details in their bodies by design — banners flag them rather than rewriting the snapshots.
- GitHub Wiki was not touched — that remains FT-049 scope.

## 2026-08-16 — FT-067 amount magnitude words fixed

### Goal

Prevent the local text parser from silently dropping amount magnitude words, e.g. storing `зарплата 12 млн` as `12` with confidence 1.

### Changes

- Added focused regression coverage in `tests/processTextInput.test.ts` for `млн`, `миллионов`, `тыс`, `тысяч`, `к`, `тыщ`, `2 млн сум`, plain `1000000`, ambiguous comma decimals, `кг`, and unrecognized post-amount slang.
- Replaced the simple amount extraction in `processTextInput.ts` with a shared `parseSingleAmount()` helper that returns amount plus text before/after the amount.
- The fast parser now applies safe multipliers, removes multiplier/currency words from `description`/`merchant`, and falls back to OpenAI for ambiguous comma decimals or unsafe one-sided semantic phrases like `зарплата 12 лямов` instead of saving the bare number.

### Verification

- RED: `npm test -- tests/processTextInput.test.ts --runInBand -t "unrecognized words after the amount"` failed before the guard, proving the regression test caught the lost-magnitude path.
- GREEN: same targeted test passed after the guard.
- `npm test -- tests/processTextInput.test.ts --runInBand` — passed, 29 tests.
- `npm run verify` — passed: backend build, 29 Jest suites / 265 tests, 1 webapp Vitest suite / 4 tests, webapp build, dependency-cruiser, and madge circular check.

### Notes

Claude Code implemented the main parser/test slice; Hermes reviewed the diff, ran an independent Claude Code review, added the final unsafe-trailing-word guard, reran targeted and full verification, and marked FT-067 done in `TASKS.md`.

## 2026-08-16 — FT-068 cash withdrawal wording fixed

### Goal

Stop obvious cash-withdrawal wording such as `снял в банкомате 300000` from falling through to the simple expense parser.

### Changes

- Added `isObviousCashWithdrawal()` and `mentionsCashWithdrawal()` helpers in `processTextInput.ts`.
- Expanded cash indicators/sources to include ATM/card/account wording plus `naqd` Uzbek spelling.
- Ambiguous withdrawal phrases (`снял 300000`, `снял квартиру 3000000`, unsafe magnitude slang) now fall back to OpenAI instead of becoming `semanticType=expense` silently.
- Added regression coverage for Russian and Uzbek withdrawal phrases and an own-transfer guard.
- Marked FT-068 done in `TASKS.md`.

### Verification

- RED: `npm test -- tests/processTextInput.test.ts --runInBand -t "cash withdrawal wording"` failed on `снял со счета 500000` before the `счет\p{L}*` fix.
- GREEN: same targeted test passed after the pattern fix.
- `npm test -- tests/processTextInput.test.ts --runInBand` — passed, 43 tests.
- `npm run verify` — passed: backend build, 29 Jest suites / 280 tests, 1 webapp Vitest suite / 4 tests, webapp build, dependency-cruiser, and madge circular check.

### Review notes

Independent Claude Code review found no blocker after tests passed. Non-blocking follow-up: `OWN_ACCOUNT_TARGET_PATTERN` is broader now (`счет\p{L}*`); future parser hardening can add more negative transfer-vs-bill examples if needed.

## 2026-08-16 — FT-053 budget near-limit threshold fixed

### Goal

Fix false near-limit budget alerts caused by comparing `percentageUsed` (0–100) with a fractional default threshold (`0.8`).

### Changes

- Standardized internal near-limit scale to percent values: default `getBudgetsNearLimit(..., 80)`.
- Kept the public `alerts?threshold=` legacy fraction contract: `0.8` still means 80%; values above 1 are treated as percent.
- Added threshold normalization/clamping in `BudgetController`; unparsable or out-of-range values fall back to 80%.
- Updated `DashboardService` to request 80%, not 0.8%.
- Updated WebApp budget view model so the card badge marks 80%+ as `Близко к лимиту`, matching backend/Home near-limit semantics.
- Added backend and webapp regression tests for 48%, 85%, 79/80/81 boundaries, endpoint threshold normalization, and dashboard service usage.
- Marked FT-053 done in `TASKS.md`.

### Verification

- RED: `npm test -- tests/budgetNearLimitThreshold.test.ts tests/dashboardService.test.ts --runInBand` failed before implementation: 48% was near-limit and callers passed 0.8.
- RED: `cd webapp && npm run test -- src/entities/budget/lib/toViewModel.test.ts` failed before implementation: 80/85% cards still showed `Внимание`.
- GREEN: backend targeted tests passed, 19 tests.
- GREEN: webapp targeted tests passed, 4 tests.
- `npm run verify` — passed: backend build, 30 Jest suites / 293 tests, 2 webapp Vitest suites / 8 tests, webapp build, dependency-cruiser, and madge circular check.

### Review notes

Independent Claude Code review found the main scale fix correct. Hermes added explicit threshold clamping/range tests after review feedback.

## 2026-08-16 — FT-052 analytics category breakdown semantic filter fixed

### Goal

Make the `Расходы по категориям` analytics breakdown match the Home real-expense model instead of mixing income, own transfers, savings deposits, cash withdrawals, and review-needed transactions into expense categories and the percentage denominator.

### Changes

- Updated `AnalyticsService.getDetailedCategoryBreakdown()` to use the same semantic filter as budgets/Home: `type=expense`, `countsAsBudgetSpending(normalizeSemanticType(...))`, and `!needsReview`.
- Percentages are now computed from the sum of real expenses only, not total turnover.
- Existing category breakdown tests were updated to exclude income from expense breakdowns.
- Added FT-052 regression tests with a mixed dataset containing ordinary expense, own transfer, saving deposit, cash withdrawal, `needsReview`, and income.
- Added tests that the category breakdown total equals `getAnalyticsSummary().totalExpense`, percentage splits sum to real spending, and legacy rows without `semanticType` still fall back to raw `type`.
- Marked FT-052 done in `TASKS.md`.

### Verification

- RED: new analytics tests would fail against the old implementation because income/non-expense semantic rows were included and percentages used total turnover.
- `npm test -- tests/analytics.test.ts --runInBand` — passed, 23 tests.
- `npm run verify` — passed: backend build, 30 Jest suites / 297 tests, 2 webapp Vitest suites / 8 tests, webapp build, dependency-cruiser, and madge circular check.

### Notes

Scope stayed limited to `getDetailedCategoryBreakdown()` as planned. `getMonthlyTrends`, `getSpendingPatterns`, and `getTopCategories` already had semantic filters and were not broad-refactored.

## 2026-08-16 — FT-064 dev tooling repaired

### Goal

Repair local tooling that agents rely on: `seed:test` and mobile screenshot audit in Telegram auth mode.

### Changes

- Updated `scripts/seed-test-data.ts` for the current SQLite schema:
  - users table uses `telegram_id`, `user_name`, `first_name`, `last_name`, `language_code`, `default_currency`;
  - seed now generates a UUID user id and stores transactions/budgets under that UUID, while preserving `telegram_id=test_user_dev` for local auth.
- Updated `scripts/mobile-ui-audit.js` Telegram auth injection:
  - same-origin API requests use `route.fetch()` + `route.fulfill()` with `x-dev-user-id`;
  - cross-origin API requests are continued without the dev auth header;
  - 401 responses are surfaced in `authFailures` and make the audit exit non-zero instead of false-green screenshots.
- Marked FT-064 done in `TASKS.md`.

### Verification

- `npm run seed:test` — passed on first run, created test user, 50 transactions, and 3 budgets in local ignored SQLite DB.
- `npm run seed:test` — passed on second run, detected existing `test_user_dev` and reported 50 transactions / 3 budgets using the UUID-backed `userId`.
- `node --check scripts/mobile-ui-audit.js` — passed.
- `npm run build` — passed, validating the TypeScript seed script under project config.
- Mock Mini App audit with `AUTH_MODE=telegram`, same-origin `/api/data`, and expected `x-dev-user-id` — passed with `issueCount: 0`.
- Mock Mini App audit with `AUTH_MODE=guest` against the same 401 API — exited non-zero and reported `authFailures`.
- `npm run verify` — passed: backend build, 30 Jest suites / 297 tests, 2 webapp Vitest suites / 8 tests, webapp build, dependency-cruiser, and madge circular check.

### Notes

Local `data/database.sqlite` changed during seed verification but is ignored and not committed.

## 2026-08-16 — FT-070 Telegram polling recovery and FT-043 local Mini App E2E verified

### Goal

Use the newly allowed Telegram external actions to verify the local-only Mini App path, then fix the bot polling failure observed during that run.

### Changes

- Added Telegram bot runtime status tracking in `telegramBot.ts` (`disabled`, `starting`, `running`, `retrying`, `failed`).
- Polling conflicts (`409 Conflict: terminated by other getUpdates request`) now schedule exponential-backoff retries instead of disabling the bot until process restart.
- Startup is logged when long polling launch is requested, not in the Telegraf promise resolution path that only fires when polling stops.
- Permanent polling failure after max retries is logged as an error.
- `/api/health` now exposes `telegramBot` status so the API can reveal when the bot is retrying/failed.
- Marked FT-070 and FT-043 done in `TASKS.md` after runtime verification.

### External verification

- `npm run dev:miniapp -- --chat-id=131184740` built webapp/backend, started a Cloudflare quick tunnel, updated `.env` `WEB_APP_URL`, updated Telegram persistent menu button, served the app, and returned public probe HTTP 200.
- The run reproduced the original 409 polling conflict. After the fix, logs showed retry attempts with increasing pauses: attempt 1 → 5s, attempt 2 → 10s, attempt 3 → 20s, then attempt 4 running.
- `GET http://127.0.0.1:3000/api/health` returned HTTP 200 with `telegramBot.state=running` and `attempts=4`.
- `npm run miniapp:menu -- status --chat-id=131184740` showed `.env` and Telegram menu aligned on the same Cloudflare tunnel URL.
- `BASE_URL=<tunnel> AUTH_MODE=telegram TELEGRAM_USER_ID=131184740 ROUTES=/,/transactions,/budgets,/analytics npm run design:audit` passed with `issueCount: 0`, no console errors, no bad responses, and no auth failures.

### Automated verification

- `npm test -- tests/telegramBot.test.ts --runInBand` — passed, 5 tests.
- `npm test -- tests/apiRoutes.test.ts --runInBand` — passed, 13 tests.
- `npm run verify` — passed: backend build, 30 Jest suites / 299 tests, 2 webapp Vitest suites / 8 tests, webapp build, dependency-cruiser, and madge circular check.

### Notes

The local dev process was stopped before commit. Current tunnel/menu URL is external and temporary by nature.


## 2026-08-24 — Task board актуализирован после работы через Claude Code

### Goal

Shukur вернулся после паузы и сообщил, что сам продолжал проект через Claude Code. Hermes должен был подтянуть фактическое состояние `finance-tracker-backend`, понять что изменилось, проверить проект и актуализировать локальную очередь задач.

### Discovery

- `git fetch origin --prune` показал, что `main` синхронизирован с `origin/main` (`0	0` divergence).
- После предыдущего Hermes-коммита `c1316d6` в `main` появились новые Claude Code/Hermes commits:
  - `770c94f` npm audit lockfile fixes;
  - `e5596a7`, `b975345`, `030f363`, `c0ba18f`, `6ac2ef1`, `ee76615`, `ac60890` task/docs reconciliation;
  - `d5c74d6` transaction edit + unarchive fixes;
  - `3fbb31d`, `f4bbe0c` parser amount magnitude and cash-withdrawal fixes;
  - `d448f57`, `1081988` budget/analytics semantic consistency fixes;
  - `4b567fe` seed/mobile-audit tooling repair;
  - `2b377e1` Telegram polling conflict recovery.
- Working tree was clean before this docs update.

### Current board state after review

Done/verified in the latest batch:

- FT-067 — amount magnitude words;
- FT-068 — cash withdrawal wording;
- FT-053 — budget near-limit threshold;
- FT-052 — analytics category breakdown semantic filter;
- FT-064 — seed and mobile audit tooling;
- FT-043 — local Mini App / Telegram end-to-end run documented and verified;
- FT-070 — Telegram polling conflict recovery.

Still open and safe next queue:

1. FT-044 — semantic smoke scenarios on live input;
2. FT-045 — historical semantic backfill preview (read-only only);
3. FT-055 → FT-058 — daily screen UX/readability slices;
4. FT-049 → FT-050 — GitHub issue/branch hygiene after product-critical local flow;
5. FT-059 → FT-061 — design/i18n/performance polish.

Still blocked/backlog by product or external-effect decisions: FT-054, FT-062, FT-063, FT-069, FT-071, FT-046, FT-048.

### Verification

```bash
npm run verify
```

Result: passed — backend build, 30 Jest suites / 299 tests, 2 webapp Vitest suites / 8 tests, webapp build, dependency-cruiser, and madge circular check.

### Changes

- Updated `TASKS.md` Active Plan revision/date, milestone checkmarks, and next implementation queue.
- Updated `CLAUDE.md` `Current Operating Mode` queue so future Claude Code sessions do not restart already-completed FT-067/068/053/052/064/043/070 work.
- Appended this report entry.


## 2026-09-03 — FT-044 live semantic smoke

### Goal

Run the live semantic smoke from `TASKS.md` against the local WSL + SQLite + Telegram/Mini App API runtime, without fixing discrepancies inline.

### Smoke scenarios

Executed through `POST /api/quick-capture` with `source=telegram` and disposable records:

| Input | Result | Status |
|---|---|---|
| `кофе 25000` | transaction `semanticType=expense`, `countsAsRealExpense=true`, amount 25 000 | pass |
| `перевел с TBC на Alif 500000` | transaction `semanticType=own_transfer`, `countsAsRealExpense=false` | pass |
| `положил на вклад 1000000` | transaction `semanticType=saving_deposit`, `countsAsRealExpense=false` | pass |
| `одолжил Азизу 200000` | debt `owed_to_me` created, but an extra linked transaction is persisted as `semanticType=expense` | mismatch → FT-072 |

### Analytics / budget evidence

Expected dashboard monthly expense delta for the full smoke was only the real coffee expense:

```text
expected: 25 000
actual:   225 000
```

The extra 200 000 comes from the hidden debt-linked transaction. Coffee budget spending delta was correct at 25 000, so the new bug was scoped to debt-linked transaction semantics/dashboard expenses and recorded as `FT-072`.

### Weekly review check

Created previous-week disposable rows and ran the real `summarizeWeeklyReview` + `formatWeeklyReviewSummary` path for the `/week` output shape. Result:

```text
realExpenses: 25 000
excludedMovementsTotal: 1 500 000
own_transfer: 500 000
saving_deposit: 1 000 000
```

The formatted message contains `Еженедельный обзор`, `Реальные расходы`, `Не расходы`, `Перевод себе`, and `Вклад / накопление`.

### Cleanup

All disposable transactions and debts created by the smoke were deleted with HTTP 200. During the first failed assertion run, three leaked disposable debt-linked transactions were also found and deleted.

### Evidence

Full machine-readable report:

```text
/tmp/ft044-semantic-smoke-report.json
```

### Board changes

- Marked `FT-044` done as a QA task.
- Added `FT-072` as the next high-priority correctness task before `FT-045`.


## 2026-09-03 — FT-072 debt-linked transaction semantics

### Goal

Fix the bug found by FT-044: `одолжил Азизу 200000` created a debt but also persisted a hidden linked transaction as plain `semanticType=expense`, inflating dashboard real expenses by 200 000.

### Changes

- `src/modules/debt/application/createDebt.ts`
  - linked debt creation transactions now include `semanticType: 'debt'` and `needsReview: false`.
- `src/modules/debt/application/payDebt.ts`
  - partial/full debt payment linked transactions now also include `semanticType: 'debt'` and `needsReview: false`.
- `tests/debt.test.ts`
  - added regression coverage for both debt directions (`OWED_TO_ME`, `I_OWE`) at creation time;
  - added regression coverage for partial and full payment linked transactions.

### TDD evidence

Claude Code first added a regression test and ran it before the production-code change. RED failure:

```text
Expected: "debt"
Received: undefined
Tests: 1 failed, 21 passed, 22 total
```

After implementation, targeted `tests/debt.test.ts` passed.

### Verification

Targeted gate:

```bash
npm test -- tests/debt.test.ts tests/processTextInput.test.ts tests/analytics.test.ts tests/dashboardService.test.ts --runInBand
```

Result: 4 suites / 120 tests passed.

Full gate:

```bash
npm run verify
```

Result: 33 Jest suites / 393 tests passed, 7 webapp Vitest files / 40 tests passed, backend build passed, webapp build passed, dependency-cruiser passed, madge circular check passed.

### Live smoke after restart

After rebuild and restarting `npm run dev:miniapp`, ran disposable smoke:

```text
input: одолжил Азизу 200000
debt: type=owed_to_me, amount=200000
linked transaction: type=expense, semanticType=debt, category=debt
dashboard monthly totalExpense delta: 0
cleanup: debt 200, transaction 200
```

Evidence: `/tmp/ft072-live-smoke-report.json`.

### Next

FT-045 remains next: historical semantic backfill preview, read-only only.


## 2026-09-03 — FT-045 historical semantic backfill preview

### Goal

Build a safe preview for old rows stuck on the legacy `semanticType=expense` default, without applying any real backfill.

### Changes

- Added `scripts/preview-semantic-backfill.ts` and `npm run preview:semantic`.
  - SQLite is opened with `OPEN_READONLY`.
  - The script avoids TypeORM because the local datasource may synchronize schema just by connecting.
  - SQL is limited to `PRAGMA table_info(transactions)` and `SELECT ... FROM transactions`.
- Added `src/modules/transaction/domain/semanticBackfillSuggestion.ts`.
  - Pure deterministic suggestion logic for legacy candidate rows.
  - Confident suggestions: debt-linked rows, debt wording, savings wording, obvious cash withdrawal, obvious own transfer, legacy income rows.
  - Ambiguous wording becomes `needsReview` candidates instead of silent rewrites.
- Added `src/modules/transaction/application/previewSemanticBackfill.ts`.
  - Produces counters, groups, examples and disputed rows.
- Extracted shared semantic keyword vocabulary to `src/shared/domain/semantics/semanticKeywords.ts` and reused it from the live text parser to avoid rule drift.
- Added `tests/semanticBackfillSuggestion.test.ts`.

### Local preview evidence

Command:

```bash
npm run --silent preview:semantic -- --format=json --examples=3 --disputed=10 > /tmp/ft045-semantic-preview.json
npm run --silent preview:semantic -- --examples=2 --disputed=5 > /tmp/ft045-semantic-preview.md
```

Read-only proof:

```text
before=85412dceb5f033175e6ba63a9dc44d25eeae267da14dd655b9f6b491afb97c9b
after=85412dceb5f033175e6ba63a9dc44d25eeae267da14dd655b9f6b491afb97c9b
```

Current local result:

```text
scanned=80
alreadyTyped=6
candidates=74
confident=14
needsReview=1
unmatched=59
bySuggestedType: income=10, debt=4, own_transfer=1
```

The one disputed row was an ambiguous transfer phrase, correctly reported as a `needsReview` candidate rather than a safe rewrite.

### Verification

Targeted:

```bash
npm test -- tests/semanticBackfillSuggestion.test.ts tests/semanticTransactionParsing.test.ts tests/processTextInput.test.ts --runInBand
npm run build
npm run typecheck:scripts
```

Results: 3 Jest suites / 106 tests passed, backend build passed, script typecheck passed.

Full gate:

```bash
npm run verify
```

Result: 34 Jest suites / 424 tests passed, 7 webapp Vitest files / 40 tests passed, backend build passed, webapp build passed, dependency-cruiser passed, madge circular check passed.

### Next

Do not apply any backfill automatically. FT-045 only provides evidence for a later user-approved backfill decision. Next implementation queue item is FT-055.


## 2026-09-03 — FT-055 budgets page duplication and period labelling

### Goal

Make `/budgets` readable on mobile: remove duplicate per-budget cards, clarify period/date labels, avoid duplicated days-left text, and reserve red for actual overspend rather than forecast risk.

### Changes

- `webapp/src/pages/budgets/ui/BudgetsPage.tsx`
  - replaced the full `BudgetOverview` widget with an aggregate-only `BudgetTotals` card on `/budgets`; individual budgets now appear only once in `Все бюджеты`.
- `webapp/src/widgets/budget-overview/ui/BudgetTotals.tsx` + `webapp/src/entities/budget/lib/toTotals.ts`
  - added aggregate totals card for all budgets without per-budget rows.
- `webapp/src/entities/budget/lib/toViewModel.ts`
  - monthly labels now use spending month plus exact range, e.g. `Сентябрь 2026 • 01.09–01.10`;
  - days-left copy is a single explicit line, e.g. `Ещё 3 дня до 6 сентября`;
  - burn-down wording is now `Прогноз:` / `Риск:`; red is only for actual exceeded budgets.
- `webapp/src/entities/budget/lib/plural.ts`
  - added small Russian plural helper for days/budgets.
- Tests updated/added:
  - `webapp/src/entities/budget/lib/toViewModel.test.ts`;
  - `webapp/src/entities/budget/lib/toTotals.test.ts`.

### Verification

Targeted webapp checks:

```bash
npm run test:webapp
npm run build:webapp
```

Result: 8 webapp test files / 45 tests passed; webapp build passed.

Full gate:

```bash
npm run verify
```

Result: 34 Jest suites / 424 tests passed, 8 webapp Vitest files / 45 tests passed, backend build passed, webapp build passed, dependency-cruiser passed, madge circular check passed.

### Screenshot QA

Authenticated mobile screenshots were captured at the required widths:

```text
/tmp/ft055-budgets-audit-content/screenshots/budgets-375.png
/tmp/ft055-budgets-audit-content/screenshots/budgets-390.png
/tmp/ft055-budgets-audit-content/screenshots/budgets-412.png
/tmp/ft055-budgets-audit-content/screenshots/budgets-390-bottom.png
/tmp/ft055-budgets-audit-content/metrics.json
```

Metrics: authenticated audit `issueCount=0`; center CTA remained aligned at 375/390/412 (`centerX == viewportCenterX`: 187.5 / 195 / 206).

Visual notes: aggregate card no longer duplicates individual budgets; `Кофе` and `Коммунальные` appear as list cards once; period labels are explicit; days-left appears once per card; bottom-scroll screenshot confirms the last card content is reachable above the dock.

### Next

Next implementation queue item is FT-056: transaction row readability.
