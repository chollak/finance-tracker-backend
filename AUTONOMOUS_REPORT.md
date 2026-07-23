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
