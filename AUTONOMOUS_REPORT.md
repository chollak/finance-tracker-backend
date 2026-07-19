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
