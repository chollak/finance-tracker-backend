# Finance Tracker — Task Board

> Source of truth пока локальный: этот файл. Позже перенесём задачи в GitHub Issues, когда backlog и процесс стабилизируются.

## Status Legend

- `backlog` — идея, ещё не готова к разработке
- `ready` — задача описана и готова для Claude Code
- `in_progress` — Claude Code работает
- `review` — Hermes проверяет
- `needs_fix` — Hermes нашёл проблему, задача возвращается Claude Code
- `blocked` — нужен ответ/решение Шукура
- `done` — Hermes независимо подтвердил результат

## Rules

- Hermes ведёт этот board, формулирует задачи и делает финальный QA gate.
- Claude Code реализует только одну чётко описанную задачу за раз.
- Claude Code может запускать тесты, но не переводит задачу в `done` сам.
- Перед `done` Hermes запускает реальные проверки: diff, tests, build, webapp build, API/UI smoke по необходимости.
- Без явного разрешения не делать force push, reset, удаление файлов или production deploy.

---

## Current Tasks

### FT-000: Normalize line endings and restore clean git baseline

Status: done
Priority: high
Owner: Hermes
Type: repo-hygiene

Context:
Git showed 437 modified files, but `git diff --ignore-cr-at-eol --quiet` returned clean. Root cause: CRLF/LF line ending mismatch between WSL/Git working tree and index.

Definition of Done:
- [x] Confirm that changes are line-ending-only
- [x] Add `.gitattributes` to enforce LF for text files
- [x] Restore meaningful `git status` baseline
- [x] Commit `.gitattributes` with local workflow files

Verification:
- `git diff --ignore-cr-at-eol --quiet` returned `exit=0`
- After adding `.gitattributes`, `git status --short` shows only new repo-management files

---

### FT-001: Audit current project state

Status: done
Priority: high
Owner: Hermes
Type: audit

Goal:
Understand the current state of backend, Telegram bot, webapp, docs, tests, CI, architecture, and product direction before delegating development to Claude Code.

Definition of Done:
- [x] Read `CLAUDE.md`, `README.md`, `package.json`, `webapp/package.json`
- [x] Run baseline checks: backend build, backend tests, webapp build, architecture analyze
- [x] Summarize actual architecture and product state
- [x] Identify stale docs vs current implementation
- [x] Identify first safe development tasks for Claude Code
- [x] Produce short roadmap

Audit summary:
- Actual implementation has 8 modules: transaction, budget, debt, voiceProcessing, openai-usage, dashboard, subscription, user.
- Main delivery surfaces: Express REST API, Telegram bot, React/Vite Telegram Mini App.
- Current architecture checks are stable after FT-002.
- `docs/VISION.md` is stale: it marks DebtModule and SubscriptionModule as TODO, while source code and architecture docs show both modules exist.
- Best next step is documentation reconciliation before more feature work, so future agents do not follow stale roadmap text.

Verification:
- `npm run build` — passed
- `npm test -- --runInBand` — passed, 7 suites / 35 tests
- `npm run build:webapp` — passed
- `npm run analyze` — initially failed with dependency-cruiser violations; passed after FT-002

---

### FT-002: Fix dependency-cruiser architecture violations

Status: done
Priority: high
Owner: Claude Code
Type: tech-debt

Context:
`npm run analyze` currently fails.

Observed violations:
1. Circular dependency:
   - `src/shared/infrastructure/database/entities/Debt.ts`
   - `src/shared/infrastructure/database/entities/DebtPayment.ts`
2. Application layer imports infrastructure logging:
   - `src/shared/application/learning/transactionLearning.ts → src/shared/infrastructure/logging/index.ts`
   - `src/shared/application/learning/seedPatterns.ts → src/shared/infrastructure/logging/index.ts`
   - `src/shared/application/helpers/userIdResolver.ts → src/shared/infrastructure/logging/index.ts`

Definition of Done:
- [x] `npm run analyze` passes
- [x] Existing tests still pass
- [x] `npm run build` passes
- [x] Fix respects Clean Architecture rules in `CLAUDE.md` and `docs/BACKEND_STANDARDS.md`
- [x] No unrelated refactor

Verification:
- `npm run analyze` — passed
- `npm run build` — passed
- `npm test -- --runInBand` — passed, 7 suites / 35 tests
- `npm run build:webapp` — passed

Implementation notes:
- Application-layer files now import logging from `src/shared/application/logging`, not infrastructure logging.
- TypeORM Debt/DebtPayment relation cycle was broken by using string relation targets and structural relation types instead of runtime cross-imports.
- `SqliteDebtRepository.mapPaymentToEntity` now accepts the structural fields it actually needs.

Suggested Claude Code instruction:
Completed. Original instruction was to fix only the dependency-cruiser violations without unrelated refactors.

---

### FT-003: Reconcile stale docs with actual implementation

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: docs

Context:
Some docs are stale. `docs/VISION.md` marks DebtModule and SubscriptionModule as TODO, while `CLAUDE.md`, source code, and `docs/knowledge-base/01-architecture/modules.md` show those modules already exist.

Goal:
Make project docs match actual implementation before feature development, so agents do not follow outdated roadmap information.

Definition of Done:
- [x] Identify stale sections across `docs/`, `README.md`, `CLAUDE.md`, `AUDIT.md`
- [x] Update docs to match actual code state
- [x] Preserve useful Claude Code guidance
- [x] Add clear "current status" and "next roadmap" sections
- [x] Do not modify source code
- [x] `npm run build`, `npm test -- --runInBand`, `npm run build:webapp`, and `npm run analyze` still pass

Verification:
- `git diff --stat` — 7 doc files changed, no `src/`/`tests/`/`webapp/src/`/config/migration files touched
- `npm run build` — passed
- `npm test -- --runInBand` — passed, 7 suites / 35 tests
- `npm run build:webapp` — passed
- `npm run analyze` — passed (no dependency violations, no circular deps)

Implementation notes:
- `docs/VISION.md` — DebtModule, SubscriptionModule, Payment Integration, and Free Trial were all marked TODO but are fully implemented (`src/modules/debt/`, `src/modules/subscription/`, `TelegramPaymentService`, `StartTrialUseCase`). Rewrote "Готовые фичи", replaced "Блокеры для запуска" with a "Текущий статус" section reflecting reality, and replaced phases 1-4 of "План выхода на прод" with a "Next Roadmap" section. Flagged one real gap found during verification: `SubscriptionService.processExpiredSubscriptions()` exists but isn't wired to any scheduler.
- `CLAUDE.md` and `docs/knowledge-base/README.md` said 7 and 5 modules respectively; both corrected to 8, matching `docs/knowledge-base/01-architecture/modules.md`.
- `docs/knowledge-base/01-architecture/overview.md` module table was missing `SubscriptionModule` and `UserModule` rows (said "6 modules"); added.
- `docs/knowledge-base/README.md` "Module Dependencies" diagram and "Module Structure" file list only covered 3-4 of the 8 modules; expanded.
- `README.md` referenced a nonexistent `src/framework/express` path (actual: `src/delivery/web/express/`); fixed and pointed to the module docs instead of duplicating the list.
- `AUDIT.md` (2026-01-20 snapshot) had marked its own "module count mismatch" doc issue as fixed, but it wasn't — appended an addendum noting this so the report isn't taken at face value again.
- Not touched (out of the explicit FT-003 scope, flagged for follow-up instead): `PROJECT_DOCUMENTATION.md` still says "5 main modules" and is missing Debt/Subscription/User sections entirely; `docs/knowledge-base/07-data-flow/*.md` use Russian category display names (e.g. "Продукты") in example payloads instead of category IDs (e.g. "groceries"), inconsistent with the ID-vs-display-name rule in `CLAUDE.md`.

Hermes QA closeout:
- [x] Verified changed files are documentation/process files only
- [x] Confirmed FT-003 changes are already committed and pushed to GitHub
- [x] Accepted remaining doc uncertainties as follow-up scope, not blockers

Suggested Claude Code instruction:
Completed. Original instruction was documentation-only reconciliation; Hermes QA accepted and marked done.

---

### FT-005: Clean up remaining documentation inconsistencies

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: docs

Context:
FT-003 reconciled the main stale documentation, but intentionally left two broader consistency issues as follow-up scope:

1. `PROJECT_DOCUMENTATION.md` still describes "5 main modules" and lacks Debt/Subscription/User sections.
2. `docs/knowledge-base/07-data-flow/*.md` examples use Russian category display names (for example, `Продукты`) where project rules prefer category IDs (for example, `groceries`).

Goal:
Make remaining developer docs consistent with the current 8-module implementation and category ID conventions, without changing source code.

Scope:
- Documentation/process files only.
- Allowed likely files:
  - `PROJECT_DOCUMENTATION.md`
  - `docs/knowledge-base/07-data-flow/api-lifecycle.md`
  - `docs/knowledge-base/07-data-flow/budget-calculation.md`
  - `docs/knowledge-base/07-data-flow/voice-to-transaction.md`
  - `TASKS.md`
  - `AUTONOMOUS_REPORT.md`

Definition of Done:
- [x] `PROJECT_DOCUMENTATION.md` reflects 8 modules and no longer says "5 main modules"
- [x] DebtModule, SubscriptionModule, and UserModule are represented where module overview docs list modules
- [x] Data-flow examples use canonical category IDs where payloads/store values are shown
- [x] Russian display names are kept only where clearly presented as UI labels/display values
- [x] No source code/config/package/migration/env changes
- [x] `npm run build`, `npm test -- --runInBand`, `npm run build:webapp`, and `npm run analyze` pass

Implementation notes:
- `PROJECT_DOCUMENTATION.md` Module System section renumbered 1-8 (Transaction, Budget, Debt, VoiceProcessing, OpenAIUsage, Dashboard, Subscription, User), matching `CLAUDE.md` and `docs/knowledge-base/01-architecture/modules.md`. Added DebtModule, SubscriptionModule, UserModule blurbs (use cases, dependencies, infrastructure) that weren't there before.
- `docs/knowledge-base/07-data-flow/voice-to-transaction.md`, `api-lifecycle.md`, `budget-calculation.md`: replaced Russian category display names (`Продукты`, `Кафе`, `Другое`) with canonical IDs (`groceries`, `restaurants`, `other`) in all payload/store-value examples (GPT output, API request/response JSON, SQL INSERT, `categoryIds` arrays, confidence-scoring code). Left the two Telegram bot reply-message examples using `Продукты` as-is — those are genuine UI display labels shown to the end user, not stored/payload values.
- `PROJECT_DOCUMENTATION.md`'s `API Endpoints` section still has no routes listed for Debt/Subscription/User — left untouched since it's an endpoint list, not a "module overview" doc, which is what this task's scope covered; flagged as a further follow-up if wanted.

Hermes QA closeout:
- [x] Verified changed files are documentation/process files only
- [x] Re-ran build/test/webapp build/analyze successfully
- [x] Accepted missing Debt/Subscription/User API endpoint reference as follow-up scope, not a blocker
- [x] Marked FT-005 done after QA

Suggested Claude Code instruction:
Completed. Original instruction was documentation-only cleanup; Hermes QA accepted and marked done.

---

### FT-006: Deep project audit and simplification plan

Status: done
Priority: high
Owner: Hermes, optional Claude Code research support
Type: audit/architecture

Context:
Before new product feature work, Shukur wants to understand the current project deeply and tune the project to our workflow. We need to identify unnecessary parts, dead code, outdated infrastructure, architecture smells, and unclear ownership boundaries.

Goal:
Produce a grounded audit of the current codebase/infrastructure and a safe cleanup/refactor plan. Do not make broad code changes during the audit phase.

Scope:
- Map source architecture, modules, delivery surfaces, scripts, infra, docs, generated artifacts.
- Identify candidates for dead/unused code, stale scripts, obsolete docs, duplicate concepts, weak test coverage, risky config, and architecture/infrastructure issues.
- Prefer evidence from real commands and file inspection.
- Record findings with confidence levels: confirmed / likely / needs validation.

Definition of Done:
- [x] Current project map is documented
- [x] Dead-code / unused / obsolete candidates are listed with evidence
- [x] Architecture and infrastructure risks are listed with evidence
- [x] Proposed cleanup/refactor backlog is created and prioritized
- [x] No destructive changes made without explicit approval
- [x] AUTONOMOUS_REPORT.md contains audit summary and next recommended steps


Initial findings:
- Project has 8 backend modules, 149 tracked `src/**/*.ts` files, 193 `webapp/src` files, 7 test files.
- Runtime delivery surfaces: Express REST API under `/api`, Telegram bot, React/Vite webapp served from `public/webapp`.
- Static checks currently pass: `npm run analyze`, `npm run build`.
- Confirmed obsolete/broken script: `npm run migrate:notion` points to missing `dist/scripts/migrate-from-notion.js`; docker-compose migration profile points to the same missing artifact.
- Confirmed dependency cleanup candidates from depcheck: `cors`, `@types/cors`, `shadcn`; investigate before removal. `dependency-cruiser` is used by npm scripts though depcheck reports it as unused.
- Confirmed suspicious script dependency: `scripts/migrate-userId.ts` imports `better-sqlite3`, but package.json does not declare it.
- Confirmed scheduler gap: `SubscriptionService.processExpiredSubscriptions()` exists but is not invoked by any scheduler/cron in source.
- Likely dead/barrel files from import graph: `delivery/messaging/telegram/handlers/index.ts`, `modules/subscription/{application,domain,presentation}/index.ts`, `shared/domain/ports/index.ts`; `seedPatterns.ts` exports `createSeedPatterns()` but is not called.
- Test coverage is narrow: current tests cover transaction/budget/dashboard/voice text path; no direct debt/subscription/user/Telegram/payment/API route integration tests.

---

### FT-007: Remove obsolete legacy migration surface

Status: done
Priority: high
Owner: Hermes
Type: cleanup

Context:
FT-006 found a broken legacy migration path: `package.json` and `docker-compose.yml` referenced a missing migration artifact, and deployment/docs/env examples still mentioned deprecated migration variables. Shukur confirmed this legacy path is no longer needed.

Changes:
- Removed the broken migration npm script from `package.json`.
- Removed the broken Docker Compose migration profile.
- Removed deprecated migration variables from `.env.example` and `.env.development`.
- Removed stale migration references from `README.md`, `CLAUDE.md`, `PROJECT_DOCUMENTATION.md`, and `DEPLOYMENT.md`.
- Removed stale external-service error constant from `src/shared/domain/constants/messages.ts`.
- Removed matching local `.env` lines without printing secret values.

Verification:
- [x] `npm run build` passed
- [x] `npm test -- --runInBand` passed, 7 suites / 35 tests
- [x] `npm run build:webapp` passed
- [x] `npm run analyze` passed
- [x] Active repository search no longer finds legacy migration references outside historical audit logs

---

### FT-008: Separate learning seed data from runtime data

Status: done
Priority: high
Owner: Hermes
Type: cleanup/data-policy

Context:
FT-006 found that `data/learning-data.json` and `data/patterns.json` were tracked even though `TransactionLearningService` writes to these files at runtime. That can create noisy diffs and accidental user-learning-data commits.

Changes:
- Added tracked seed files:
  - `data/learning-data.seed.json`
  - `data/patterns.seed.json`
- Removed tracked runtime files:
  - `data/learning-data.json`
  - `data/patterns.json`
- Added `.gitignore` rules for runtime learning files while keeping `data/*.seed.json` trackable.
- Updated `TransactionLearningService` to load seed files when runtime files are missing, but only write to ignored runtime files.
- Added tests covering seed fallback and runtime file creation.
- Updated learning docs to describe seed vs runtime data policy.

Verification:
- [x] Watched new `transactionLearning` tests fail before implementation
- [x] `npm test -- transactionLearning --runInBand` passed
- [x] Full build/test/webapp/analyze passed

---

### FT-009: Dependency and obsolete migration script cleanup

Status: done
Priority: high
Owner: Hermes
Type: cleanup/dependencies

Context:
FT-006 found unused dependency candidates (`cors`, `@types/cors`, `shadcn`) and a missing dependency (`better-sqlite3`) used only by obsolete `scripts/migrate-userId.ts`.

Goal:
Remove confirmed unused dependencies and obsolete one-off migration scripts without changing product runtime behavior.

Scope:
- Root `package.json` / `package-lock.json`
- Obsolete migration scripts under `scripts/`
- `TASKS.md` / `AUTONOMOUS_REPORT.md`

Definition of Done:
- [x] Confirm no source imports `cors` or root `shadcn`
- [x] Remove unused deps and update lockfile through npm
- [x] Remove obsolete `migrate-userId` script(s)
- [x] `depcheck` no longer reports these confirmed cleanup items, except known false-positive `dependency-cruiser`
- [x] Full build/test/webapp/analyze passes
- [x] Commit and push

Implementation notes:
- Removed `cors`, `@types/cors`, and root `shadcn` through `npm uninstall`, updating `package-lock.json`.
- Removed obsolete one-off `scripts/migrate-userId.ts` and `scripts/migrate-userId.sql`; the TypeScript script required undeclared `better-sqlite3`, and the SQL script was test-user-specific historical migration code.
- Updated API lifecycle docs and `CLAUDE.md` to describe custom CORS headers instead of the removed `cors` package.
- `depcheck` now reports no unused runtime deps and no missing deps; `dependency-cruiser` remains a known depcheck false-positive because it is used by `npm run check:deps`.

---

### FT-010: Review orphan/barrel files

Status: done
Priority: medium
Owner: Hermes
Type: cleanup/dead-code

Context:
FT-006 found several likely unused source/barrel files. These were not deleted until import graph and search evidence confirmed they had no consumers.

Removed files:
- `src/delivery/messaging/telegram/handlers/index.ts`
- `src/modules/subscription/application/index.ts`
- `src/modules/subscription/domain/index.ts`
- `src/modules/subscription/presentation/index.ts`
- `src/shared/domain/ports/index.ts`
- `src/shared/application/learning/seedPatterns.ts`

Rationale:
- Barrel files had no imports anywhere in source/docs scripts except historical audit logs.
- `seedPatterns.ts` was superseded by tracked `data/*.seed.json` files in FT-008 and was never called.
- `npx madge --orphans --extensions ts src` now reports only `index.ts`, the runtime entrypoint.

Verification:
- [x] `npm run build` passed after deletion
- [x] `npm test -- --runInBand` passed
- [x] `npm run build:webapp` passed
- [x] `npm run analyze` passed
- [x] `npx madge --orphans --extensions ts src` reports only `index.ts`

---

### Foundation Roadmap before feature work

Status: active
Owner: Hermes
Plan: `.hermes/plans/2026-07-19_173252-development-foundation-roadmap.md`

Shukur clarified that we should **not** implement subscription expiry automation yet. Priority is preparing the development foundation: reliable CI, standard commands, env/config clarity, stronger tests, and task workflow.

---

### FT-011: CI quality gate consolidation

Status: done
Priority: high
Owner: Hermes
Type: foundation/ci

Goal:
Make GitHub Actions match Hermes local verification before deploy. Existing deploy workflow runs tests and webapp build, but not backend build/analyze.

Definition of Done:
- [x] CI runs backend build, tests, webapp build, and architecture checks
- [x] Deploy depends on passing gates
- [x] No secrets printed
- [x] Local verification passes before commit/push

---

### FT-012: Standardize project command surface

Status: done
Priority: high
Owner: Hermes
Type: foundation/scripts

Goal:
Add one obvious command for agents/CI/local work, likely `npm run verify`.

Definition of Done:
- [x] `npm run verify` runs build, test:ci, webapp build, analyze
- [x] Docs tell Hermes/Claude/users to use it before commit/push
- [x] Existing scripts keep working

Implementation notes:
- Added `typecheck`, `test:ci`, and `verify` scripts to `package.json`.
- Updated `deploy.yml` to run `npm run verify` in `quality-gate` before deploy.
- Updated `README.md`, `CLAUDE.md`, and quick-start docs to use `npm run verify` as the pre-commit/pre-push gate.

---

### FT-013: Environment/config cleanup

Status: done
Priority: medium
Owner: Hermes
Type: foundation/config

Goal:
Clarify `.env`, `.env.local`, and `.env.development` behavior without exposing secrets.

Definition of Done:
- [x] Env loading rules are documented
- [x] Example env remains safe
- [x] App startup behavior is clear

Implementation notes:
- Removed tracked `.env.development` and added it to `.gitignore`; use `.env.local` for machine-specific local config.
- Clarified `AppConfig` policy: existing `process.env` values stay highest priority; app loads `.env.local` if present, otherwise `.env`.
- Refreshed `.env.example` as the only tracked safe template.
- Updated README, CLAUDE.md, DEPLOYMENT.md, and quick-start docs.
- Verified local `.env` still exists but was never printed with real values.

---

### FT-014: Test safety net for core modules

Status: done
Priority: high
Owner: Hermes + Claude Code
Type: foundation/tests

Goal:
Add tests around debt, subscription, user, and critical API route behavior before product features.

Definition of Done:
- [x] Debt module core behavior tested
- [x] Subscription/limits/trial behavior tested
- [x] User resolution/guest behavior tested
- [x] Critical API route behavior tested where practical
- [x] TDD followed for new tests/behavior

Progress:
- FT-014A debt safety tests completed by Claude Code and QAed by Hermes.
- Added `tests/debt.test.ts` with 21 tests covering create, pay partial/full, linked transaction behavior, validation/errors, update/cancel, delete, and get/filter behavior.
- Verification passed: `npm test -- debt --runInBand`, `npm run verify`.
- Full test suite after FT-014A: 9 suites / 58 tests.
- FT-014B subscription safety tests completed by Claude Code and QAed by Hermes.
- Added `tests/subscription.test.ts` with 32 tests covering trial, free/premium limits, usage counters, grant premium, create/replace subscription, status lookup, cancel, and subscription service behavior.
- Verification passed: `npm test -- subscription --runInBand`, `npm run verify`.
- Full test suite after FT-014B: 10 suites / 90 tests.
- FT-014C user resolution/guest safety tests completed by Claude Code and QAed by Hermes.
- Added `tests/userResolution.test.ts` with 39 tests covering user get/create/update, UUID/telegramId/guest resolution, fail-open resolver behavior, and ownership verification/guest bypass behavior.
- Verification passed: `npm test -- userResolution --runInBand`, `npm run verify`.
- Full test suite after FT-014C: 11 suites / 129 tests.
- FT-014D critical API route safety tests completed by Claude Code and QAed by Hermes.
- Added `tests/apiRoutes.test.ts` with 12 tests covering health, 404, CORS preflight, JSON parsing, guest/auth behavior for voice/debt routes, dev auth bypass, and global error handler mapping.
- Verification passed: `npm test -- apiRoutes --runInBand`, `npm run verify`.
- Full test suite after FT-014D: 12 suites / 141 tests.
- Finding recorded: wildcard-mounted `notFoundHandler` currently reports `Route GET / not found` instead of the actual unmatched path.

---

### FT-015: Runtime/process mode decision document

Status: done
Priority: medium
Owner: Hermes
Type: foundation/architecture

Goal:
Decide how API, Telegram bot, and future worker should run before implementing background jobs.

Definition of Done:
- [x] Options documented: single process vs `APP_MODE=all|api|bot|worker` vs split entrypoints
- [x] Recommendation recorded
- [x] No scheduler/product automation implemented yet

Implementation notes:
- Added `docs/knowledge-base/01-architecture/runtime-process-mode.md`.
- Decision: keep current single-process runtime for now; when the first real background job is approved, implement `APP_MODE=all|api|bot|worker` first and run jobs only in worker mode.
- No scheduler/product automation was implemented.

---

### FT-017: Test logging and error contract cleanup plan

Status: done
Priority: medium
Owner: Hermes
Type: foundation/quality

Goal:
Preserve findings from FT-014 and define a safe cleanup order for noisy test logs and behavior-contract decisions.

Definition of Done:
- [x] Findings documented from FT-014
- [x] Follow-up subtasks split by risk
- [x] No production behavior changed
- [x] Recommended order recorded

Implementation notes:
- Added `docs/knowledge-base/08-development/test-logging-and-contract-cleanup.md`.
- Captured follow-ups:
  - FT-017A quiet test logging
  - FT-017B decide `GetUserUseCase` not-found convention
  - FT-017C normalize/document `UpdateUserUseCase` missing-user behavior
  - FT-017D decide resolver fail-open vs fail-closed
  - FT-017E validate empty userId early
  - FT-017F fix API 404 path message
- FT-017A quiet test logging completed: app/Winston/env-load logs are silent under `NODE_ENV=test` unless `TEST_LOGS=true`.
- FT-017F API 404 path message completed: `notFoundHandler` reports `req.originalUrl` so unknown routes include the actual path.
- FT-017C user update Result contract completed: `UpdateUserUseCase.execute()` returns `Result<User>` and controller unwraps it.
- FT-017E empty userId validation completed: `resolveUserIdToUUID()` rejects empty/whitespace-only IDs before user creation.
- FT-017B user not-found contract completed: `GetUserUseCase` now returns `Result.failure(NotFoundError)` for missing users.
- FT-017D resolver fail-open decision recorded: do not globally flip loose resolver to fail-closed yet; future strict resolver should be introduced per security-sensitive path.
- No broader API/user resolver contract changes were made.

---

### FT-016: GitHub task workflow foundation

Status: done
Priority: medium
Owner: Hermes
Type: foundation/workflow

Goal:
Decide whether to keep local `TASKS.md` as source of truth or migrate FT-011..FT-016 to GitHub Issues.

Definition of Done:
- [x] Decision recorded
- [x] If GitHub Issues are created, labels are simple and useful
- [x] `TASKS.md` remains high-level dashboard

Implementation notes:
- Added `docs/knowledge-base/08-development/task-workflow.md`.
- Decision: keep `TASKS.md` as source of truth for now; do not create GitHub Issues yet.
- Reason: Shukur has not explicitly chosen GitHub UI, product backlog is still being shaped, and `gh` is not installed locally.
- Recommended future labels if/when migrating: `foundation`, `feature`, `bug`, `tech-debt`, `docs`, `test`, `blocked`.

---

### FT-018: API/domain consistency audit

Status: done
Priority: high
Owner: Hermes
Type: foundation/architecture

Goal:
Audit API/controller/use-case consistency after foundation cleanup and split the next safe architecture tasks.

Definition of Done:
- [x] Controller/use-case inventory completed
- [x] Result/error/userId consistency findings recorded
- [x] Risk-ranked next tasks proposed
- [x] No broad source behavior changes made
- [x] `npm run verify` passed

Implementation notes:
- Added `docs/knowledge-base/01-architecture/api-domain-consistency-audit.md`.
- Main findings:
  - Controller Result unwrapping is repetitive.
  - Some validation paths use raw `new Error(...)`, which maps to 500 instead of 400.
  - Use-case return conventions vary by module; document before enforcing globally.
  - `transactionController.ts` is large and should not be split until route coverage improves.
  - Guest/auth/ownership behavior needs a boundary matrix before strict resolver migration.
  - Subscription limit fail-open and voice text-input default userId are product-policy questions, not automatic refactors.
- Recommended autonomous next tasks: FT-019, FT-020, FT-022, FT-024.

---

### FT-020: Normalize controller raw Error mapping

Status: done
Priority: medium
Owner: Hermes
Type: foundation/api

Goal:
Start normalizing controller paths where raw `new Error(...)` maps client/resource errors to 500. Keep scope to a small TDD slice.

Definition of Done:
- [x] Failing route test added first
- [x] One raw-error path normalized to `AppError`/proper status
- [x] Targeted test and build passed
- [x] `npm run verify` passed

Implementation notes:
- Added API route regression coverage for `GET /api/debts/:debtId?withPayments=true` when ownership verification succeeds but the with-payments lookup returns `success: true, data: null`.
- Before fix, route returned 500 due raw `new Error('Debt not found')`.
- After fix, controller returns `ErrorFactory.notFound('Debt', debtId)` and API responds 404.
- This is a first slice only; other raw validation errors remain listed in FT-018.

---

### FT-022: API route coverage matrix

Status: done
Priority: medium
Owner: Hermes
Type: foundation/tests

Goal:
Inventory current API route-level coverage and identify high-value next route tests before controller refactors.

Definition of Done:
- [x] Route family coverage matrix documented
- [x] Existing tested route behaviors listed
- [x] High-value next route test slices proposed
- [x] No broad route test expansion
- [x] `npm run verify` passed

Implementation notes:
- Added `docs/knowledge-base/08-development/api-route-coverage-matrix.md`.
- Recommendation: add transaction route ownership/validation coverage before splitting/refactoring `transactionController.ts`.
- Avoid testing every route mechanically; prioritize auth/ownership/validation/response-shape boundaries.

---

### FT-024: Auth/user resolution boundary matrix

Status: done
Priority: medium
Owner: Hermes
Type: foundation/security-architecture

Goal:
Document current auth, guest, ownership, and userId-resolution boundaries before strict resolver implementation.

Definition of Done:
- [x] Middleware semantics documented
- [x] Route family boundary matrix recorded
- [x] Strict vs loose resolver recommendations captured
- [x] Stop conditions documented
- [x] `npm run verify` passed

Implementation notes:
- Added `docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md`.
- Decision: keep current loose resolver behavior globally; introduce strict resolver separately before migrating security-sensitive paths.
- Stop before changing subscription fail-open, voice missing-userId, guest access policy, or production auth behavior.

---

### FT-022A: Transaction route ownership/validation tests

Status: done
Priority: high
Owner: Hermes
Type: foundation/tests

Goal:
Add route-level safety coverage for transaction by-id ownership/validation behavior before future transaction controller refactors.

Definition of Done:
- [x] Transaction route test harness added
- [x] Missing transaction maps to 404
- [x] Non-guest resource without auth fails closed
- [x] Guest-owned resource can be read without auth
- [x] Empty guest update body maps to 400 and does not call update use case
- [x] Any exposed behavior bug fixed with TDD
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/transactionRoutes.test.ts` with 4 route-boundary tests.
- RED exposed that transaction by-id/resource routes used `allowGuestMode`, which blocks requests without `userId` before resource ownership can be checked.
- Updated transaction resource-scoped routes (`/:id`, delete/update/archive/unarchive/batch archive) to use `optionalAuth`, matching Budget/Debt resource-scoped patterns.
- Controller-level `verifyResourceOwnership` still fails closed for non-guest resources and allows guest-owned resources.

---

### FT-020B: Dashboard validation error normalization

Status: done
Priority: medium
Owner: Hermes
Type: foundation/api

Goal:
Normalize dashboard controller missing-userId errors from raw `Error`/500 to `ValidationError`/400.

Definition of Done:
- [x] RED controller tests prove raw missing-userId errors mapped to 500
- [x] Dashboard missing-userId branches use `ErrorFactory.validation(...)`
- [x] Targeted tests and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/dashboardController.test.ts` for missing userId on insights and quick stats.
- Replaced all dashboard `new Error('User ID is required')` branches with `ErrorFactory.validation('User ID is required')`.
- Route patterns still require `:userId`; this covers defensive/controller-level behavior and prevents future helper reuse from mapping validation to 500.

---

### FT-020C: Budget validation error normalization

Status: done
Priority: medium
Owner: Hermes
Type: foundation/api

Goal:
Normalize budget controller missing-userId errors from raw `Error`/500 to `ValidationError`/400.

Definition of Done:
- [x] RED controller tests prove raw missing-userId errors mapped to 500
- [x] Budget missing-userId branches use `ErrorFactory.validation(...)`
- [x] Targeted tests and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/budgetController.test.ts` for create budget and budget alerts missing-userId branches.
- Replaced all budget controller `new Error('User ID is required')` branches with `ErrorFactory.validation('User ID is required')`.
- This is defensive controller-level cleanup; current route definitions still include `:userId` on user-scoped budget routes.

---

### FT-020D: Debt validation error normalization

Status: done
Priority: medium
Owner: Hermes
Type: foundation/api

Goal:
Normalize debt controller missing-id errors from raw `Error`/500 to `ValidationError`/400.

Definition of Done:
- [x] RED controller tests prove raw missing-id errors mapped to 500
- [x] Debt missing userId/debtId/paymentId branches use `ErrorFactory.validation(...)`
- [x] Targeted tests and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/debtController.test.ts` for create debt, pay debt full, and delete payment missing-id branches.
- Replaced debt controller `new Error('User ID is required')`, `new Error('Debt ID is required')`, and `new Error('Payment ID is required')` branches with `ErrorFactory.validation(...)`.

---

### FT-024A: Strict userId resolver helper

Status: done
Priority: medium
Owner: Hermes
Type: foundation/security-architecture

Goal:
Add a strict userId resolver helper for future security-sensitive API boundaries without migrating existing routes yet.

Definition of Done:
- [x] `resolveUserIdToUUIDStrict(...)` added
- [x] Existing loose `resolveUserIdToUUID(...)` behavior unchanged
- [x] Tests cover UUID/guest passthrough, telegramId resolution, empty-id validation, and fail-closed resolver errors
- [x] No route migration performed in this task
- [x] `npm run verify` passed

Implementation notes:
- Added `resolveUserIdToUUIDStrict(...)` in `src/shared/application/helpers/userIdResolver.ts`.
- Strict resolver throws `BusinessLogicError('Failed to resolve userId to UUID')` when telegramId resolution fails.
- Kept current fail-open resolver for backwards-compatible Telegram/guest flows.
- Extended `tests/userResolution.test.ts` from 40 to 44 tests.

---

### FT-019A: Controller Result helper budget slice

Status: done
Priority: medium
Owner: Hermes
Type: foundation/api

Goal:
Start standardizing repetitive controller Result handling with a small, verified BudgetController slice.

Definition of Done:
- [x] Existing `handleResultResponse(...)` behavior covered by tests
- [x] Helper accepts generic use-case errors and forwards them through `handleControllerError(...)`
- [x] One controller slice adopts the helper without broad API-shape changes
- [x] Targeted tests and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/controllerHelpers.test.ts`.
- Broadened `handleResult(...)` / `handleResultResponse(...)` error typing from `AppError` to `unknown`, matching actual use-case Result failures while preserving runtime behavior.
- Refactored BudgetController create/list/summaries/update Result-response branches to use `handleResultResponse(...)`.
- Kept BudgetController delete branch explicit to preserve existing `data: null` response shape.

---

### FT-021: Transaction/debt relationship audit

Status: done
Priority: high
Owner: Hermes
Type: foundation/domain-audit

Goal:
Document current debt ↔ transaction behavior and accounting ambiguities before changing money semantics.

Definition of Done:
- [x] Current create debt and payment transaction flows documented
- [x] Debt/transaction link fields documented
- [x] Analytics implications documented
- [x] Ambiguous accounting/product decisions listed
- [x] No behavior change made
- [x] `npm run verify` passed

Implementation notes:
- Added `docs/knowledge-base/01-architecture/transaction-debt-relationship-audit.md`.
- Current model: Debt records obligation state; debt-related transactions record cash movement.
- Finding: `DebtEntity.relatedTransactionId` exists but is not populated by current create flow; transaction side uses `Transaction.relatedDebtId`.
- Finding: voice debt response appears to set `linkedTransactionId` to debt ID because actual transaction ID is unavailable.
- Finding: analytics excludes at least some debt-related transactions; future analytics should distinguish operating spend/income vs cash-flow.
- No money semantics were changed in this task.

---

### FT-021A: Voice debt linkedTransactionId contract

Status: done
Priority: medium
Owner: Hermes
Type: foundation/domain-contract

Goal:
Stop voice/text debt responses from reporting a debt ID as `linkedTransactionId` when no actual transaction ID is available.

Definition of Done:
- [x] RED test proves `linkedTransactionId` should not equal debt ID when debt has no transaction ID
- [x] Text input debt response uses actual `Debt.relatedTransactionId` only
- [x] Voice input debt response uses actual `Debt.relatedTransactionId` only
- [x] Targeted tests and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added a regression test in `tests/processTextInput.test.ts`.
- Updated `ProcessTextInputUseCase` and `ProcessVoiceInputUseCase`.
- This does not yet populate `Debt.relatedTransactionId`; it only prevents a misleading response field.

---

### FT-023: DTO/schema validation consistency audit

Status: done
Priority: medium
Owner: Hermes
Type: foundation/architecture

Goal:
Audit validation layering and decide whether to introduce a schema library or continue with current helpers.

Definition of Done:
- [x] Controller/use-case/shared-validator layers documented
- [x] Existing shared validation helpers documented
- [x] Risks around parseFloat/parseInt/message churn documented
- [x] Decision recorded: no new schema dependency now
- [x] `npm run verify` passed

Implementation notes:
- Added `docs/knowledge-base/01-architecture/dto-schema-validation-audit.md`.
- Decision: keep controller/use-case validation split; do not add Zod/Yup/Joi yet.
- Use existing `Validators` / `TransactionValidator` opportunistically in small TDD slices.
- Avoid global validation message churn because it can break clients/tests.

---

### QA-BUG-1: Telegram bot launch failure must not crash API

Status: done
Priority: high
Owner: Hermes
Type: bug/runtime

Context:
Claude Code local browser QA found that an invalid/expired `TG_BOT_API_KEY` caused `bot.launch()` to reject asynchronously and crash the entire backend process after startup.

Goal:
Telegram bot startup failures should disable bot functionality but not bring down the Express API/webapp process.

Definition of Done:
- [x] Regression test proves `bot.launch()` has a rejection handler
- [x] `bot.launch()` async rejection logs error/warning instead of becoming unhandled
- [x] Targeted test and TypeScript build passed
- [x] `npm run verify` passed

Implementation notes:
- Added `tests/telegramBot.test.ts`.
- Updated `src/delivery/messaging/telegram/telegramBot.ts` to attach `.then(...).catch(...)` to `bot.launch()`.
- Preserves current behavior when bot launches successfully; failure path now matches existing comment: application continues without Telegram bot functionality.

---

### QA-BUG-2: Friendly SPA 404 page

Status: done
Priority: medium
Owner: Hermes
Type: bug/webapp-ux

Context:
Claude Code local browser QA found that unknown Mini App routes showed React Router's raw developer error page in both dev and production static builds.

Goal:
Render a branded/user-friendly 404/route error state instead of React Router's default developer error page.

Definition of Done:
- [x] Unknown nested SPA routes render a friendly 404 page
- [x] Router errors render a branded fallback
- [x] Webapp build passed
- [x] `npm run verify` passed

Implementation notes:
- Updated `webapp/src/app/router/routes.tsx`.
- Added `NotFoundPage` using existing `EmptyState` and `Button` components.
- Added `RouterErrorPage` via `errorElement` and a catch-all `path: '*'` child route.

---

### QA-BUG-3: Telegram polling config flags

Status: done
Priority: low
Owner: Hermes
Type: bug/config

Context:
Claude Code local QA found `ENABLE_TELEGRAM_POLLING` and `WEBHOOK_MODE` were defined in `AppConfig` but not honored by Telegram bot startup.

Goal:
Make Telegram bot polling runtime flags explicit and covered by regression tests.

Definition of Done:
- [x] `ENABLE_TELEGRAM_POLLING=false` prevents Telegram polling startup
- [x] `WEBHOOK_MODE=true` prevents polling startup for webhook deployments
- [x] Telegram launch rejection handler regression remains covered
- [x] Env template/docs mention the flags
- [x] Targeted Telegram bot tests passed
- [x] `npm run verify` passed

Implementation notes:
- `ENABLE_TELEGRAM_POLLING` now defaults to enabled unless explicitly set to `false`.
- `startTelegramBot` returns before creating/launching Telegraf when polling is disabled or webhook mode is enabled.

---

### FT-026: Recurring budget periods

Status: ready
Priority: high
Owner: Hermes
Type: product/backend+ui

Context:
Current budgets are fixed date ranges (`startDate`/`endDate`). Users expect `period: monthly` budgets to roll over automatically each month, but current behavior can keep showing the old period or accumulate spending across the selected fixed range.

Goal:
Make budgets behave like recurring rules: e.g. `Коммунальные — 2 000 000 / month` should calculate spending for the current monthly cycle and reset the displayed spent amount each new period without requiring manual budget recreation.

Scope:
- Add/define `BudgetPeriodCalculator` for current daily/weekly/monthly/quarterly/yearly cycle from an anchor date.
- Budget summaries should calculate `spent`, `remaining`, `percentageUsed`, and `daysRemaining` for the current cycle.
- Preserve old `startDate` as the anchor for existing budgets.
- UI should clearly show current cycle label/date range (e.g. `Июль 2026`, `01.07–31.07`).
- Add regression tests: monthly budget must not include previous-month expenses in the new month.

Definition of Done:
- [ ] Backend tests cover monthly rollover/reset behavior.
- [ ] Budget summaries use current period date range.
- [ ] UI shows current budget period clearly.
- [ ] `npm run verify` passes.

---

### FT-025: Fast simple text transaction parser

Status: done
Priority: high
Owner: Hermes
Type: ux/performance

Context:
Live dev-bot testing showed simple messages like `кофе 15000 сум` worked after OpenAI configuration was fixed, but response latency was noticeably high because every text input went through OpenAI.

Goal:
Handle simple quick-add text transactions locally before falling back to OpenAI for complex natural language and debts.

Scope:
- Simple format only: `<label> <amount> [сум|sum|uzs]`
- Expense transactions only
- Use canonical category IDs via existing category alias normalization
- Keep OpenAI fallback for complex phrases and debt phrases

Definition of Done:
- [x] Regression test proves `кофе 15000 сум` creates a transaction without calling OpenAI
- [x] Simple parser maps label aliases to category IDs (`кофе` → `coffee`)
- [x] Debt-like phrases still fall back to OpenAI
- [x] Targeted `processTextInput` tests pass
- [x] `npm run verify` passes

Implementation notes:
- Updated `src/modules/voiceProcessing/application/processTextInput.ts`.
- Added a local `parseSimpleTextTransaction` fast path before `openAIService.analyzeInput`.
- Updated `tests/processTextInput.test.ts` with TDD coverage for OpenAI bypass.

---


---

### FT-027: UI/product improvement roadmap

Status: in_progress
Priority: high
Owner: Hermes + Claude Code
Type: frontend-ui/product

Context:
Design review found that the Mini App works, but the UI is still more module-dashboard than financial assistant. The next product direction is to make the app insight-first: how much was spent, where limits are close/over, and what needs attention now.

Roadmap:
- `.hermes/plans/2026-07-22_175141-ui-product-improvements.md`

Subtasks:
- [x] FT-027A — Insight-first home and balance terminology
- [ ] FT-027B — Actionable budget remaining UX
- [ ] FT-027C — Mobile add CTA and bottom navigation review
- [ ] FT-027D — Simplify transaction archive surface
- [ ] FT-027E — Browser/screenshot UI QA

Delegation policy:
- Claude Code implements one slice at a time.
- Claude Code must not commit/push.
- Hermes reviews diff, runs `npm run build:webapp` / `npm run verify`, updates docs, then commits/pushes.

---

### FT-027A: Insight-first home and balance terminology

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: frontend-ui

Problem:
`BalanceCard` currently presents `netIncome` as `Баланс`, which can imply a real card/account balance. Home is data-first instead of answering what matters financially now.

Scope:
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/widgets/balance-card/**`
- small shared formatting/helper files if needed

Definition of Done:
- [x] User-facing text no longer implies `netIncome` is real card balance
- [x] Home first screen is more insight-first using existing dashboard data
- [x] Quick add income/expense remains available
- [x] No backend/API/schema/env/package/deploy changes
- [x] `npm run build:webapp` passes
- [x] `npm run verify` passes before commit/push
- [x] Hermes reviewed Claude Code diff

Implementation notes:
- `BalanceCard` now labels `netIncome` as `Чистый поток за месяц` and explains it is income minus expenses, not account/card balance.
- Added `AttentionSummary` widget on Home using existing dashboard fields: over-budget count, near-limit budget count, and top spending category.
- No backend/API/schema/env/package/deploy changes.

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge.


---

### FT-027B: Actionable budget remaining UX

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: frontend-ui

Problem:
Budget cards show progress percentage and raw remaining amount, but should more directly tell the user what this means: `Осталось X`, `Перерасход X`, and how long until the period ends.

Scope:
- `webapp/src/entities/budget/ui/BudgetCard.tsx`
- `webapp/src/entities/budget/lib/toViewModel.ts`
- `webapp/src/entities/budget/model/types.ts` if new formatted fields are needed
- `webapp/src/widgets/budget-overview/ui/BudgetOverview.tsx` if needed for consistency

Definition of Done:
- [x] Budget cards emphasize `Осталось X` or `Перерасход X`
- [x] Budget period/time remaining is clear
- [x] Progress percentage remains available but secondary
- [x] No backend/API/schema/env/package/deploy changes
- [x] `npm run build:webapp` passes
- [x] `npm run verify` passes before commit/push
- [x] Hermes reviewed Claude Code diff

Implementation notes:
- `budgetToViewModel` now exposes actionable headline fields: remaining/overspent label, amount, color, and time context.
- `BudgetCard` promotes `Осталось X` / `Перерасход X` as the primary card message.
- `BudgetOverview` now reuses `budgetToViewModel` for consistent compact budget summaries.
- Overspend is calculated as `Math.max(0, spent - amount)`.

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge.


---

### FT-027C: Mobile add CTA and bottom navigation review

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: frontend-ui

Problem:
Adding a transaction is the core action, but current UI uses separate FAB patterns across Home/Transactions/Budgets/Debts. On mobile this can overlap bottom navigation and Telegram safe areas.

Scope:
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- `webapp/src/pages/budgets/ui/BudgetsPage.tsx`
- `webapp/src/pages/debts/ui/DebtsPage.tsx` if needed for consistent FAB behavior
- small shared component/helper under `webapp/src/shared/ui` or `webapp/src/features/quick-add` if useful

Definition of Done:
- [x] Mobile add transaction CTA is easier to discover
- [x] FABs avoid bottom nav/safe-area overlap
- [x] Desktop behavior remains reasonable
- [x] Existing routes and quick-add behavior remain stable
- [x] No backend/API/schema/env/package/deploy changes
- [x] `npm run build:webapp` passes
- [x] `npm run verify` passes before commit/push
- [x] Hermes reviewed Claude Code diff

Implementation notes:
- Bottom navigation now has a central elevated add transaction action that opens `QuickAddSheet`.
- Transactions page hides the duplicate mobile add-transaction FAB; desktop keeps the existing add button.
- Budget/debt page FAB spacing is safe-area aware and clears the bottom nav.
- Layout bottom padding is safe-area aware.

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge.


---

### FT-027D: Simplify transaction archive surface

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: frontend-ui

Problem:
The Transactions screen exposes `Архив`, `Активные`, and `Архивировать все` as prominent concepts. This is useful functionality, but can feel too technical/risky for MVP users compared with the main job: review and add transactions.

Scope:
- `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- small shared UI imports if already present/needed

Definition of Done:
- [x] Archive functionality remains available
- [x] Bulk archive action is less visually prominent / safer
- [x] User-facing copy is clearer and less technical where possible
- [x] Main transaction review flow remains simple
- [x] No backend/API/schema/env/package/deploy changes
- [x] `npm run build:webapp` passes
- [x] `npm run verify` passes before commit/push
- [x] Hermes reviewed Claude Code diff

Implementation notes:
- Transactions tabs now use `Текущие` / `Скрытые` copy instead of prominent archive jargon.
- Bulk action moved out of the header into a quiet `Скрыть все текущие` action below the active list.
- Confirmation dialog emphasizes that nothing is deleted and the transactions can be restored.
- Hermes adjusted wording from `баланс` to `текущие итоги` to stay consistent with FT-027A terminology.

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge.


---

### FT-027E: Browser/screenshot UI QA

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: frontend-ui/qa

Problem:
FT-027A-D were verified by code review and builds, but still need browser-level mobile UI QA for visual hierarchy, nav/FAB overlap, and console/network issues.

Scope:
- QA/report only unless a tiny frontend-only fix is clearly necessary and safe.
- Target screens: Home, Transactions, Budgets, Add Transaction, Add Budget.

Definition of Done:
- [x] Mobile viewport browser smoke attempted
- [x] Console/network/API errors reported
- [x] Visual issues around bottom nav, central CTA, FABs, and safe area assessed
- [x] Screenshots or a precise tooling blocker captured
- [x] Report saved under `/tmp`
- [x] No backend/API/schema/env/package/deploy changes

QA notes:
- Report saved to `/tmp/finance-ft027e-ui-qa-report.md`.
- Screenshots saved under `/tmp/finance-ft027e-screenshots/` (15 PNGs).
- Dev and production passes covered Home, Transactions, Budgets, Add Transaction, and Add Budget at 390×844.
- No console errors, page errors, or unexpected 4xx/5xx responses were found.
- No P0/P1 UI defects found.
- P2 doc/process finding: `/webapp/*` legacy redirect/docs wording are stale relative to root routing.
- P3 dev-only finding: TanStack Query Devtools icon overlaps Save button in dev screenshot only; production is unaffected.


---

### FT-027F: Bottom navigation visual polish after Telegram screenshot

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/hotfix

Context:
Shukur shared a real Telegram Mini App screenshot showing that the FT-027C bottom navigation was functionally correct but visually ugly: the central black circular `+` looked too heavy, labels were cramped, and active state did not match the finance green accent.

Changes:
- [x] Changed `Транзакции` nav label to shorter `История` to reduce crowding
- [x] Made active nav item use finance green accent
- [x] Reduced central `+` from 56px black circle to calmer 48px green rounded-square action
- [x] Added nav backdrop/shadow polish and tighter label spacing
- [x] Captured post-fix mobile screenshot: `/tmp/ft027f-nav-after.png`
- [x] `npm run build:webapp` passed
- [x] `npm run verify` passed

Verification:
- Playwright mobile viewport screenshot captured with no console/network errors.
- `npm run verify` passed: 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, and madge.


---

### FT-027G: True-center mobile bottom nav and transactions alignment

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/hotfix

Context:
Real Telegram Mini App screenshots showed that the mobile bottom-nav `+` button was visually off-center. Claude Code review confirmed the root cause: 2 left items + center + 3 right items made the button sit at ~41.5% of screen width instead of 50%. Transactions page also had an inconsistent container/max-width strategy that made the page feel visually off.

Changes:
- [x] Bottom nav IA changed to `Главная | История | + | Бюджеты | Ещё`
- [x] `Долги` and `Аналитика` moved behind a new `/more` page
- [x] Bottom nav layout changed from asymmetric flex to `grid-cols-[1fr_auto_1fr]`
- [x] `Ещё` tab is highlighted when on `/more`, `/debts`, or `/analytics`
- [x] Transactions page root width simplified to `container mx-auto px-4 py-6`
- [x] Transactions tabs made full-width and empty state spacing adjusted
- [x] Production screenshots captured for nav and transactions
- [x] `npm run build:webapp` passed
- [x] `npm run verify` passed

Verification evidence:
- `/tmp/ft027g-prod-home-390.png`
- `/tmp/ft027g-prod-transactions-390.png`
- `/tmp/ft027g-visual-check.json`: center button equals viewport center at 375/390/412px
- `npm run verify`: 18 suites / 166 tests passed, backend build, webapp build, dependency-cruiser, madge.


---

### FT-027H: Remove competing mobile budget FAB

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/hotfix

Context:
After centering the global bottom-nav `+`, the budget page still had its own mobile floating `+` button for creating budgets. This competed visually with the global center CTA and could confuse the hierarchy.

Changes:
- [x] Budget creation no longer uses a mobile floating FAB
- [x] Desktop fixed `Создать бюджет` button preserved
- [x] Mobile budget creation moved in-page for non-empty budget lists
- [x] Empty-state budget CTA preserved
- [x] Production mobile screenshot captured: `/tmp/ft027h-prod-budgets-auth-390.png`
- [x] `npm run verify` passed


---

### FT-027I: Neutralize primary action styling and define design direction

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
The center bottom-nav `+` had been changed to green as a quick visual fix, but Shukur agreed this was semantically wrong: green is a financial success/income color, while adding a transaction is a generic primary action and may often be an expense.

Changes:
- [x] Center bottom-nav `+` changed from green success fill to neutral surface/border/foreground icon
- [x] Bottom-nav active state changed from green to neutral foreground
- [x] More page row icons changed from success green to neutral secondary surface
- [x] Added `docs/knowledge-base/10-design-guidelines/style-direction.md`
- [x] Updated design guidelines color rules to reserve green/red/orange for semantic money states
- [x] Updated `globals.css` design-system header away from “Green Accent”
- [x] Production screenshot captured: `/tmp/ft027g-prod-home-390.png`
- [x] `npm run verify` passed


---

### FT-027J: Immediate UI regression cleanup after real-user review

Status: done
Priority: critical
Owner: Hermes
Type: frontend-ui/backend-analytics/hotfix

Context:
Shukur reported multiple UI regressions: neutral-white nav `+` became too subtle, Transactions page heading was incorrectly centered, transaction tabs looked compressed, Home showed `Зарплата` as the top spending category, recent transactions clipped/failed to scroll, and Debts still had a competing mobile floating FAB.

Changes:
- [x] Bottom-nav center `+` changed to visible neutral primary (`bg-primary`), not semantic green and not low-contrast white
- [x] Transactions header restored to left alignment
- [x] Transactions tabs height increased to reduce compressed feel
- [x] Dashboard top categories now use expense-only, non-debt transactions so income categories like `Зарплата` cannot appear as top spending
- [x] Attention summary copy changed to `Крупнее всего расходы` and supports wrapping
- [x] Recent transactions on Home no longer uses nested fixed-height scroll; shows 5 rows inline and hides row action menu in the widget
- [x] Transaction list amount column made truncation-safe on narrow screens
- [x] Debts mobile floating FAB removed; desktop fixed button preserved
- [x] Analytics tests updated for expense-only top categories
- [x] `npm run verify` passed

Verification evidence:
- `/tmp/ft027j-audit-home-390.png`
- `/tmp/ft027j-audit-transactions-390.png`
- `/tmp/ft027j-audit-debts-390.png`
- `npm run verify`: 18 suites / 166 tests passed, backend build, webapp build, dependency-cruiser, madge.


---

### FT-028: Full mobile UI audit and regression cleanup

Status: done
Priority: critical
Owner: Hermes
Type: frontend-ui/design-audit

Context:
Shukur reported that the app design had regressed after several isolated UI fixes. The task was to audit core mobile pages and bring urgent problems back toward a unified standard.

Audit artifacts:
- `/tmp/ft028-ui-audit/report.md`
- `/tmp/ft028-ui-audit/metrics.json`
- `/tmp/ft028-ui-audit/screenshots/*.png`

Immediate fixes applied:
- [x] Center bottom-nav `+` is visible neutral-primary (`bg-primary`), not green and not low-contrast white
- [x] Transactions page header restored to left alignment
- [x] Transactions segmented tabs made less compressed
- [x] Home top spending uses expense-only, non-debt categories
- [x] Recent transactions widget uses inline rows instead of nested fixed-height scroll
- [x] Transaction list item amount column is truncation-safe on mobile
- [x] Debts mobile floating FAB removed
- [x] Analytics tests updated for expense-only top categories
- [x] `npm run verify` passed

Follow-up recommended:
- FT-029 shared mobile page templates: `PageHeader`, `SegmentedTabs`, empty-state rules, form-page header/back pattern, repeatable screenshot QA.


---

### FT-029A: Shared mobile page header and segmented tabs foundation

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Start the shared mobile page template cleanup recommended by FT-028. Goal is to stop per-page header/tab drift by introducing shared primitives and migrating the main list/utility pages.

Changes:
- [x] Added `PageHeader` shared component for mobile-first list/overview pages
- [x] Added `SegmentedTabsList` and `SegmentedTabsTrigger` wrappers for consistent Radix tab styling
- [x] Migrated Transactions page to `PageHeader` + segmented tab wrappers
- [x] Migrated Budgets page guest and authenticated headers to `PageHeader`
- [x] Migrated Debts page guest and authenticated headers to `PageHeader`
- [x] Migrated More page to `PageHeader`
- [x] Migrated Analytics page guest and authenticated headers to `PageHeader`
- [x] Exported new primitives from `shared/ui`
- [x] Screenshot metrics confirm list-page h1 alignment at x=16 and transactions tabs 358×48 at 390px viewport
- [x] `npm run verify` passed

Follow-up:
- FT-029B: create shared segmented control for non-Radix filter tabs, starting with Debts filters.
- FT-029C: standardize empty states and form-page headers/back actions.


---

### FT-029B/C: Shared segmented controls and form-page headers

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Continue the autonomous FT-029 design-system cleanup. FT-029A introduced shared list-page headers and Radix tab wrappers. This slice adds shared non-Radix segmented controls and standardizes form-page headers.

Changes:
- [x] Added `SegmentedButtonGroup` for local state filter controls
- [x] Migrated Debts filter buttons (`Все / Я должен / Мне должны`) to `SegmentedButtonGroup`
- [x] Added `FormPageHeader` for pages outside bottom-nav layout
- [x] Migrated Add Transaction header to `FormPageHeader`
- [x] Migrated Add Budget guest/authenticated headers to `FormPageHeader`
- [x] Migrated Add Debt guest/authenticated headers to `FormPageHeader`
- [x] Exported new primitives from `shared/ui`
- [x] Screenshot audit rerun after migration
- [x] `npm run verify` passed

Follow-up:
- FT-029D: empty-state normalization and form submit visibility/keyboard-open audit.


---

### FT-029D: Empty-state dedupe and post-template screenshot audit

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Continue autonomous FT-029 cleanup after shared headers and controls. Focus: remove duplicate budget empty states and rerun screenshot audit over form/list pages.

Changes:
- [x] Budget page no longer renders BudgetOverview empty state when there are no budgets, avoiding duplicate budget empty states
- [x] Add form pages now share `FormPageHeader` from FT-029B/C
- [x] Screenshot audit rerun for budgets, debts, transactions add, budgets add, debts add
- [x] `npm run verify` passed

Evidence:
- `/tmp/ft028-ui-audit/screenshots/budgets-390.png`
- `/tmp/ft028-ui-audit/screenshots/debts-390.png`
- `/tmp/ft028-ui-audit/screenshots/add-transaction-390.png`
- `/tmp/ft028-ui-audit/screenshots/add-budget-390.png`
- `/tmp/ft028-ui-audit/screenshots/add-debt-390.png`

Follow-up:
- FT-029E: move screenshot capture script into repo as a reusable design QA gate.
- FT-029F: keyboard-open / small-height form screenshots for Add Transaction/Budget/Debt.

---

### FT-029E: Reusable mobile screenshot audit gate

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-qa

Context:
Continue autonomous FT-029 cleanup by turning the one-off `/tmp` screenshot capture into a repo-local command that future UI slices can rerun consistently.

Changes:
- [x] Added `scripts/mobile-ui-audit.js` Playwright-based mobile route audit
- [x] Added `npm run design:audit`
- [x] Added root `playwright` dev dependency so the script does not rely on a Hermes-local npx cache
- [x] Script captures screenshots and `metrics.json` for Home, Transactions, Budgets, Debts, More, add forms, and Analytics
- [x] Script reports h1/tab/nav metrics and fails when console errors or bad network responses are detected
- [x] `npm run design:audit` passed against local Vite app at 390×844
- [x] `npm run verify` passed

Evidence:
- `/tmp/ft029e-mobile-ui-audit/metrics.json`
- `/tmp/ft029e-mobile-ui-audit/screenshots/*.png`
- Center nav `+`: `centerX=195`, `viewportCenterX=195` at 390px
- List-page headers: `h1.x=16`; form-page headers: `h1.x=68`

Follow-up:
- FT-029F: keyboard-open / small-height form screenshots for Add Transaction/Budget/Debt.

---

### FT-029F: Small-height form screenshot audit

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-qa

Context:
Validate the add-form pages on a shorter mobile viewport as a proxy for keyboard-open / constrained Telegram Mini App height. Extend the reusable audit command where needed instead of relying on one-off scripts.

Changes:
- [x] Added `AUTH_MODE=telegram` support to `scripts/mobile-ui-audit.js` for authenticated-only form pages
- [x] Added `ROUTES=...` filter support for focused audits without unrelated API noise
- [x] Added `SCROLL_TO=bottom` support for submit-button visibility checks
- [x] Captured authenticated top screenshots for Add Transaction/Budget/Debt at 390×667
- [x] Captured authenticated bottom-scroll screenshots for Add Transaction/Budget/Debt at 390×667
- [x] Confirmed issueCount=0 for focused form audits
- [x] `npm run verify` passed

Evidence:
- Top screenshots: `/tmp/ft029f-small-height-auth-forms/screenshots/*.png`
- Bottom screenshots: `/tmp/ft029f-small-height-auth-forms-bottom/screenshots/*.png`
- Metrics: `/tmp/ft029f-small-height-auth-forms/metrics.json`, `/tmp/ft029f-small-height-auth-forms-bottom/metrics.json`
- Form header alignment remains `h1.x=68`; submit buttons are reachable after scroll.

Follow-up:
- No immediate form layout code change needed from this slice.


---

### FT-030: Stable local Telegram Mini App launch flow

Status: done
Priority: high
Owner: Hermes
Type: developer-experience/telegram-mini-app

Context:
After FT-029, Mini App opening failed because the Cloudflare quick tunnel changed but Telegram's persistent menu button still pointed to the stale tunnel. `/start` inline buttons also embed URLs at message creation time, so local development needs a repeatable flow that keeps the tunnel, `.env` `WEB_APP_URL`, backend/bot process, and Telegram menu button in sync.

Changes:
- [x] Added `scripts/dev-miniapp.js` local Mini App helper
- [x] Added `npm run dev:miniapp -- --chat-id=<telegram_chat_id>` for end-to-end phone/Mini App testing
- [x] Added `npm run miniapp:menu -- status --chat-id=<telegram_chat_id>` for safe status inspection without printing the bot token
- [x] Added `npm run miniapp:menu -- set --url=<https_url> --chat-id=<telegram_chat_id>` for existing tunnels
- [x] Helper updates ignored local `.env` `WEB_APP_URL`
- [x] Helper updates and verifies Telegram persistent menu button via Bot API without printing `TG_BOT_API_KEY`
- [x] Helper can create a Cloudflare quick tunnel, build, run `npm run serve`, and probe the public Mini App URL
- [x] README and CLAUDE.md document the Mini App phone-testing flow and stale-button pitfall
- [x] `.env.example` documents optional `MINIAPP_CHAT_ID`

Verification:
- [x] `node --check scripts/dev-miniapp.js` passed
- [x] `npm run miniapp:menu -- status --chat-id=131184740` showed current menu URL safely
- [x] `node scripts/dev-miniapp.js run --url=https://mice-adds-growing-surfing.trycloudflare.com --chat-id=131184740 --skip-build --no-serve` updated `.env` + Telegram menu and probed public app with HTTP 200
- [x] `npm run build` passed
- [x] `npm run verify` passed

Follow-up:
- Consider a named/stable Cloudflare tunnel or production domain flow later; FT-030 only stabilizes local dev.

---

### FT-004: Decide first product vector after stabilization

Status: done
Priority: high
Owner: Shukur + Hermes
Type: product

Context:
After repo hygiene and audit, choose the next product direction.

Candidate vectors considered:
- Improve personal weekly finance review workflow
- Stabilize core transaction/userId model
- Improve Telegram bot UX
- Improve Telegram Mini App UX
- Import bank/card statements or CSV
- Production readiness and CI/CD

Decision:
- Next product vector is daily usage UX: first audit and then improve the everyday bot/Mini App flow before weekly review or import features.
- Shukur explicitly asked to record this task but not start implementation yet.

---

### FT-031: Daily usage UX audit and cleanup

Status: backlog
Priority: high
Owner: Hermes
Type: product/frontend-ui/telegram-bot-ux

Context:
After stabilizing the local Mini App launch flow in FT-030, the next product step is to make the app useful for everyday finance tracking. The goal is not to add a large new feature immediately, but to audit and clean up the daily loop so Shukur can reliably record and review transactions each day.

Scope:
- Audit the full daily user flow:
  - open Mini App from Telegram menu and fresh `/start` button;
  - add expense through Telegram text;
  - add transaction through Mini App quick add / form;
  - view recent transactions;
  - edit/delete a transaction;
  - verify data lands under the correct Telegram user.
- Identify friction in Telegram bot UX:
  - `/start` message usefulness and length;
  - button destinations;
  - response after transaction creation;
  - quick access to today/history/add flows.
- Identify Mini App daily-use issues:
  - Recent Transactions visibility;
  - quick add clarity;
  - edit/delete discoverability;
  - empty/loading/error states with real data.
- Split fixes into small follow-up slices (`FT-031A`, `FT-031B`, etc.) after the audit.

Definition of Done:
- [ ] Real daily flow is exercised against local dev Mini App/bot without printing secrets
- [ ] Findings are recorded with evidence: commands, logs, screenshots where useful
- [ ] Small safe implementation slices are listed and prioritized
- [ ] No implementation work is started until Shukur asks to proceed

Non-goals for this task:
- Weekly finance review automation
- Bank/card statement import
- Production deployment/domain migration
- Broad architecture refactor


---

### FT-031A: Daily flow audit + Telegram quick actions

Status: done
Priority: high
Owner: Hermes
Type: product/telegram-bot-ux/design-qa

Context:
Start FT-031 by exercising the daily loop and removing the first obvious friction in Telegram entry points. The Mini App itself is usable, but the `/start` entry was too shallow for daily usage: one generic app button plus a separate quick category prompt.

Audit evidence:
- [x] Current local Mini App processes checked
- [x] Public tunnel and backend were already running for manual testing
- [x] API create/list/update/delete daily-flow probe run with `X-Dev-User-Id` without printing secrets
- [x] Temporary FT-031 audit transaction was cleaned from local SQLite
- [x] Mobile screenshots captured at 390x844:
  - `/tmp/ft031a-daily-audit-after/screenshots/home-390.png`
  - `/tmp/ft031a-daily-audit-after/screenshots/transactions-390.png`
  - `/tmp/ft031a-daily-audit-after/screenshots/add-transaction-390.png`
- [x] `BASE_URL=https://markets-upc-usb-inquiry.trycloudflare.com AUTH_MODE=telegram TELEGRAM_USER_ID=131184740 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ft031a-daily-audit-after ROUTES=/,/transactions,/transactions/add npm run design:audit` passed with `issueCount: 0`

Findings:
- Home and transactions pages render without guest banner/no-auth errors when the audit uses a Telegram user fixture with dev auth headers.
- Bottom nav center `+` is centered and usable.
- Transactions list is readable and edit/delete are discoverable via the row overflow menu.
- Add Transaction form is usable on 390x844; submit is visible at bottom in the audited state.
- API create/list works in dev, but direct API update/delete with only `X-Dev-User-Id` returned 403 because those endpoints use `optionalAuth`; this does not block real Telegram Mini App auth but remains a dev-test friction to revisit if browser-only edit/delete testing is needed.

Changes:
- [x] `/start` Mini App keyboard now includes focused daily actions:
  - Open app
  - Add transaction
  - All transactions
  - Detailed analytics
- [x] Auto-saved transaction keyboard now links to All transactions + Add transaction, instead of only generic Open app
- [x] `scripts/mobile-ui-audit.js` now supports `TELEGRAM_USER_ID` / `TELEGRAM_USER_NAME` and injects `X-Dev-User-Id` for `/api/**` requests in `AUTH_MODE=telegram`, preventing false 401s in browser screenshot QA

Verification:
- [x] `npm run build` passed
- [x] `npm run verify` passed — 18 suites / 166 tests, backend build, webapp build, dependency-cruiser, madge circular scan

Follow-up:
- FT-031B: decide whether to make browser-only dev edit/delete testing work through `optionalAuth` + `X-Dev-User-Id`, or test edit/delete only with real Telegram initData.
- FT-031C: daily Mini App polish after using the new quick actions for real.


---

### FT-031B: Dev edit/delete auth path for daily-flow QA

Status: done
Priority: high
Owner: Hermes
Type: backend/auth/testability

Context:
FT-031A found that direct browser/API daily-flow QA could create/list transactions with `X-Dev-User-Id`, but update/delete returned 403 because those routes use `optionalAuth` and did not recognize the same development auth bypass as `requireAuth`. This blocked reliable browser-only edit/delete QA even though production Telegram Mini App uses `Authorization: tma <initData>`.

Root cause:
- `requireAuth` supports `X-Dev-User-Id` in non-production.
- `optionalAuth` ignored `X-Dev-User-Id`, left `req.telegramUser` unset, and ownership verification failed closed for non-guest transactions.

Changes:
- [x] Added a regression test proving update/delete work with `X-Dev-User-Id` when ownership matches
- [x] Updated `optionalAuth` to accept `X-Dev-User-Id` only when `NODE_ENV !== 'production'`
- [x] Kept production path unchanged: real Telegram Mini App requests still use `Authorization: tma <initData>`

Verification:
- [x] RED: `npm run test:ci -- tests/transactionRoutes.test.ts` failed with update 403 before the fix
- [x] GREEN: targeted transaction route test passed after the fix
- [x] Live API probe after rebuild/restart: create 201, update 200, delete 200, list 200, deleted transaction absent
- [x] Temporary FT-031B probe/repro transactions cleaned from local SQLite
- [x] `npm run verify` passed — 18 suites / 167 tests, backend build, webapp build, dependency-cruiser, madge circular scan

Follow-up:
- FT-031C: Mini App recent transactions / add-flow polish using the now-testable edit/delete path.


---

### FT-031C: Mini App recent transactions / add-flow polish

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/product-ux

Context:
Continue FT-031 by improving the daily Mini App loop after FT-031B made browser/API edit-delete QA reliable. Focus on small safe UI polish: make recent transactions more actionable from the home screen and reduce duplicated title noise in the dedicated add form.

Changes:
- [x] Home Recent Transactions card now has a clear `Добавить` action in the card header
- [x] Recent transaction rows on Home are clickable and navigate to edit transaction
- [x] Recent card description now tells the user: `Нажмите строку, чтобы изменить`
- [x] The `Все ... транзакций` link shows total count and remains available
- [x] Dedicated Add Transaction page no longer repeats the second `Добавить транзакцию` title block under `Новая транзакция`
- [x] Add Transaction feature now accepts `showHeader={false}` for page composition while keeping default header behavior for other contexts

Visual QA:
- [x] Before screenshots captured in `/tmp/ft031c-before`
- [x] After screenshots captured in `/tmp/ft031c-after`
- [x] Bottom-scroll home screenshot captured in `/tmp/ft031c-after-bottom`
- [x] `issueCount: 0` on focused authenticated audit for `/`, `/transactions`, `/transactions/add`
- [x] Add Transaction page now fits in 390x844 without duplicate title and without scrolling in the audited state
- [x] Home Recent Transactions card shows Add + edit hint; bottom nav remains fixed and centered

Verification:
- [x] `npm run build:webapp` passed
- [x] `npm run verify` passed — 18 suites / 167 tests, backend build, webapp build, dependency-cruiser, madge circular scan

Follow-up:
- FT-031D: improve Telegram bot response after adding an expense so the next action is clearer and daily summary is more useful.

---

### FT-031D: Telegram saved-transaction response polish

Status: done
Priority: high
Owner: Hermes
Type: product/telegram-bot-ux

Context:
Continue FT-031 daily-use cleanup by making the Telegram bot response after a saved transaction more actionable. Previously the message showed amount/category/type and optional totals, but the next action was not explicit and amounts had no currency label.

Changes:
- [x] Auto-saved transaction messages now show amounts and daily/monthly totals with `UZS`.
- [x] Transaction description is shown when available.
- [x] Auto-saved messages include a clear next-action hint: edit, delete, or add another transaction via buttons.
- [x] Low-confidence confirmation messages do not show the next-action hint before the user confirms.
- [x] Added regression coverage in `tests/telegramFormatters.test.ts`.

Verification:
- [x] RED: formatter test initially failed against the old message shape.
- [x] GREEN: `npm run test:ci -- tests/telegramFormatters.test.ts` passed.
- [x] `npm run build` passed.
- [x] `npm run verify` passed — 19 suites / 169 tests, backend build, webapp build, dependency-cruiser, madge circular scan.

---

### FT-031E: Telegram processing feedback for text and voice input

Status: done
Priority: high
Owner: Hermes
Type: product/telegram-bot-ux

Context:
Shukur noticed that after sending a message to the bot it was unclear whether the bot had received the request or was still processing it. Text parsing may go through OpenAI, so the user needs immediate feedback before the final saved/confirmation response.

Changes:
- [x] Text-message handling now sends Telegram `typing` chat action before finance input processing.
- [x] Quick-add pending amount flow also sends the processing action before saving.
- [x] Voice-message handling sends the processing action before file download/transcription processing.
- [x] Chat action failures are best-effort and do not block transaction/debt processing.
- [x] Added regression coverage in `tests/telegramMessageHandlers.test.ts`.

Verification:
- [x] RED: message handler test initially failed because `createTextMessageHandler` was not exported and no processing action was sent.
- [x] GREEN: `npm run test:ci -- tests/telegramMessageHandlers.test.ts` passed.
- [x] `npm run build` passed.
- [x] `npm run verify` passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.

---

### FT-032: Modern mobile bottom navigation

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Shukur liked the `21st.dev` modern mobile menu pattern and asked to adapt that style for the Finance Tracker Mini App bottom navigation.

Changes:
- [x] Added shared `ModernMobileMenu` component inspired by the 21st.dev interactive menu pattern.
- [x] Replaced the old mobile bottom nav with a floating rounded pill menu.
- [x] Kept Finance Tracker information architecture: `Главная | История | + | Бюджеты | Ещё`.
- [x] Kept the central `+` as a neutral primary action that opens `QuickAddSheet`.
- [x] Active nav items now expand with label + underline; inactive items stay icon-focused.
- [x] Added `iconBounce` animation utility for active icon feedback.
- [x] Exported the new shared nav primitive from `shared/ui`.

Visual QA:
- [x] Screenshot captured at `/tmp/ft031f-modern-nav-more/screenshots/more-390.png`.
- [x] Additional screenshots captured at `/tmp/ft031f-modern-nav-375/screenshots/more-375.png` and `/tmp/ft031f-modern-nav-412/screenshots/more-412.png`.
- [x] Center `+` metrics confirm exact viewport centering:
  - 375px: `centerX=187.5`, `viewportCenterX=187.5`
  - 390px: `centerX=195`, `viewportCenterX=195`
  - 412px: `centerX=206`, `viewportCenterX=206`
- [x] Focused visual audits for `/more` passed with `issueCount: 0`.

Verification:
- [x] `npm run build:webapp` passed.
- [x] `npm run verify` passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.

---

### FT-033: Dock-style mobile bottom navigation

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Shukur disliked the previous 21st-style expanding mobile nav and provided a new `21st.dev` dock reference/prompt. The requested direction is an icon-only floating dock with separators and a compact active pill.

Changes:
- [x] Added shared `Dock`, `DockItem`, and `DockSeparator` component in `webapp/src/shared/ui/dock.tsx`.
- [x] Installed `motion` for the shared active-pill layout animation used by the dock reference.
- [x] Replaced the expanding `ModernMobileMenu` bottom nav with the new dock pattern.
- [x] Kept Finance Tracker IA: `Главная | История | + | Бюджеты | Ещё`.
- [x] Kept the center `+` as the global Quick Add trigger via `ControlledQuickAddSheet`.
- [x] Kept symmetric layout: `2 route icons | separator | + | separator | 2 route icons`.
- [x] Removed the now-unused `modern-mobile-menu.tsx` component/export.

Visual QA:
- [x] Focused screenshot audits for `/more` passed with `issueCount: 0`.
- [x] Screenshot evidence:
  - `/tmp/ft033-dock-nav-375/screenshots/more-375.png`
  - `/tmp/ft033-dock-nav-390/screenshots/more-390.png`
  - `/tmp/ft033-dock-nav-412/screenshots/more-412.png`
- [x] Center `+` metrics confirm exact viewport centering:
  - 375px: `centerX=187.5`, `viewportCenterX=187.5`
  - 390px: `centerX=195`, `viewportCenterX=195`
  - 412px: `centerX=206`, `viewportCenterX=206`
- [x] Screenshot-backed visual judgment: dock matches the provided reference direction better than the previous expanding nav; center action is balanced and unclipped.

Verification:
- [x] Focused structural check failed before the dock existed, then passed after implementation.
- [x] `npm run build:webapp` passed.
- [x] `npm run verify` passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.
- [ ] Note: adding `motion` increased the main webapp chunk enough to trigger Vite's >600 kB warning; build still passed.

---

### FT-034: Typography foundation cleanup

Status: done
Priority: medium
Owner: Hermes
Type: frontend-ui/design-system

Context:
Shukur reported that the current Mini App typography feels inconsistent — “как будто все по разному” — and asked for a review plus improvement proposal.

Findings:
- [x] Current system used Inter but only loaded weights `400`, `600`, `700` while many components use `font-medium` (`500`), causing synthesized/inconsistent weight rendering.
- [x] Many screens mix `font-medium`, `font-semibold`, `font-bold`, arbitrary sizes, and inconsistent title scales.
- [x] Screenshots showed the biggest perceived inconsistency in page titles vs body/subtitles, empty states, CTA labels, and large money amounts.

Changes:
- [x] Switched the webapp font family from `Inter` to `Onest`.
- [x] Loaded Onest weights `400..800` from Google Fonts so `font-medium`, `font-semibold`, and `font-bold` render as real weights.
- [x] Updated CSS typography token `--font-family-sans`.
- [x] Updated TypeScript design tokens to mirror the new font family and weight scale.
- [x] Added base typography rendering improvements: `text-rendering: optimizeLegibility` and `font-synthesis-weight: none`.
- [x] Tightened heading line-height/letter-spacing for a more cohesive mobile finance feel.

Visual QA:
- [x] Baseline screenshots captured before change at `/tmp/ft034-font-audit/screenshots/`.
- [x] Post-change screenshots captured at `/tmp/ft034-onest-fonts/screenshots/`.
- [x] Focused visual audit passed with `issueCount: 0` for `/`, `/transactions`, `/more`.
- [x] Visual judgment: Onest looks more cohesive and Cyrillic-friendly than the previous Inter setup; text feels warmer and less “mixed”. Remaining inconsistency mostly comes from component-level type scale choices, not the font family itself.

Verification:
- [x] Verified Onest CSS availability from Google Fonts: HTTP 200, 5 `@font-face` entries.
- [x] `npm run build:webapp` passed.
- [x] `npm run verify` passed — 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.
- [ ] Existing Vite chunk-size warning remains from the earlier `motion` dependency, unrelated to the typography change.

Recommendation / next slice:
- Standardize page typography components next instead of ad-hoc class tuning:
  - `PageHeader`: one mobile title/subtitle scale.
  - `CardTitle`: consistent `text-base/semibold` for cards and `text-lg/semibold` only for major cards.
  - Money amounts: define `amount-display`, `amount-md`, `amount-sm` helpers with tabular numerals.
  - Body/caption: reduce random `text-[0.8rem]` / `text-[11px]` usage.

---

### FT-035: Mobile design-system cleanup

Status: done
Priority: high
Owner: Hermes
Type: frontend-ui/design-system

Context:
Shukur reported that the BalanceCard block looked ugly and then requested a proper design system so fonts, spacing, cards, and hierarchy stop drifting screen-by-screen.

Completed:
- Added shared design-system UI primitives in `webapp/src/shared/ui/typography.tsx`:
  - `PageShell` for consistent mobile page width/padding/bottom safe area.
  - `SectionStack` for consistent vertical rhythm.
  - `AmountText` for tabular money amounts with smaller `UZS` suffix.
  - `MetricStat` for two-column finance metrics.
- Refined shared `Card` defaults:
  - larger, calmer radius;
  - consistent border/shadow;
  - tighter default header/content padding;
  - consistent card title/description scale.
- Refined `PageHeader` typography/spacing for mobile pages.
- Rebuilt `BalanceCard`:
  - smaller, calmer main amount;
  - `UZS` suffix no longer competes with amount digits;
  - income/expense actions are compact and softer;
  - income/expense monthly stats are equal two-column metric blocks;
  - removed dynamic huge font sizing and break-all visual heaviness.
- Applied shared shell/rhythm to top-level Home, Transactions, Budgets, and More pages.
- Refined QuickStats cards to match the new numeric scale.
- Added bottom-nav gradient scrim so fixed dock no longer visually clashes with scrolling content underneath.

Validation:
- `npm run build:webapp` passed.
- `npm run verify` passed: 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.
- Mobile screenshot audit passed with `issueCount: 0` on `/`, `/transactions`, `/budgets`, `/more` at 375, 390, 412 px.
- Final screenshot set:
  - `/tmp/ft035-system-final-390/screenshots/home-390.png`
  - `/tmp/ft035-system-final-390/screenshots/transactions-390.png`
  - `/tmp/ft035-system-final-390/screenshots/budgets-390.png`
  - `/tmp/ft035-system-final-390/screenshots/more-390.png`
- Dock center action remained exactly centered at 390 px: `centerX=195`, `viewportCenterX=195`.

Follow-ups:
- Consider a second slice for deeper component cleanup: `BudgetCard`, `DebtCard`, `TransactionListItem`, form pages, and `EmptyState` typography.
- Consider adding a lint/audit rule later for forbidden ad-hoc typography classes in product components.

---

### FT-036: Claude-assisted UI design-system audit and shell cleanup

Status: done
Priority: high
Owner: Hermes + Claude Code
Type: frontend-ui/design-system

Context:
Shukur asked to try Claude and run a deep audit of all UI components and the design system. Claude Code was used as an implementation/audit agent; Hermes remained QA gatekeeper.

Completed:
- Ran Claude Code deep UI audit and saved it to `.hermes/plans/2026-07-29-ui-design-system-audit.md`.
- Claude audit findings:
  - P0: `PageShell` nested `<main>` inside `Layout` and doubled mobile bottom padding.
  - P1: page wrapper drift across core/form/detail pages.
  - P1: `FormPageHeader` partially adopted; edit/detail pages still had hand-rolled headers.
  - P1/P2 follow-ups: hardcoded debt/premium colors, global card radius/doc drift.
- Implemented the safest first slice:
  - `PageShell` is now a flexible shell that defaults to `div` inside `Layout`, with `as="main"` for standalone form/detail pages.
  - Removed large extra `PageShell` bottom padding; `Layout` remains the single owner of bottom-nav clearance.
  - Migrated Debts and Analytics pages to `PageShell`/`SectionStack`.
  - Migrated AddTransaction/AddBudget/AddDebt wrappers to `PageShell as="main"`.
  - Migrated EditTransaction/EditBudget/DebtDetails to `FormPageHeader` and `PageShell as="main"`.
  - Standardized `FormPageHeader` title/subtitle scale to match `PageHeader`.
- Independent Claude diff review was run; Hermes addressed the reviewer’s accessibility concern by adding `PageShell as="main"` for standalone pages and verified one `<main>` per audited route.

Validation:
- `npm run build:webapp` passed.
- `npm run verify` passed: 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.
- Screenshot audit passed with `issueCount: 0` at 375/390/412 px across:
  - `/`, `/transactions`, `/budgets`, `/more`, `/debts`, `/analytics`, `/transactions/add`, `/budgets/add`, `/debts/add`.
- Landmark validation passed:
  - core nav routes: `mainCount=1`, `navPresent=true`.
  - standalone form routes: `mainCount=1`, `navPresent=false`.
- Final screenshot set:
  - `/tmp/ft036-claude-system-final-390/screenshots/home-390.png`
  - `/tmp/ft036-claude-system-final-390/screenshots/debts-390.png`
  - `/tmp/ft036-claude-system-final-390/screenshots/add-debt-390.png`

Follow-ups:
- Separate slice for hardcoded red/purple color cleanup in debt/premium UI.
- Separate visual-review slice for global `Card` radius (`rounded-3xl` vs documented `rounded-2xl`).
- Update stale design-system docs/CLAUDE.md references to removed button variants.

---

### FT-037: Close remaining design-system audit findings

Status: done
Priority: high
Owner: Claude Code + Hermes QA
Type: frontend-ui/design-system/docs

Context:
After FT-036, Shukur asked to close all remaining UI/design-system audit moments with Claude doing the implementation and Hermes verifying. Remaining items were semantic raw-color cleanup, shared card radius alignment, and stale design-system docs.

Completed:
- Claude Code implemented the remaining follow-ups; Hermes reviewed and completed the last missed raw `amber-*` cases manually.
- Removed raw Tailwind palette classes from `webapp/src` product UI for the audited color families:
  - debt overdue/danger UI now uses `destructive` tokens.
  - usage warning/progress UI now uses `warning` tokens.
  - subscription/premium trial UI no longer uses `purple-*`/`amber-*` direct palette classes.
- Preserved visual distinction between paid Premium and Trial after Claude review:
  - paid Premium badge uses neutral/secondary style.
  - Trial badge uses warning style.
- Changed default shared `Card` radius from `rounded-3xl` to documented standard `rounded-2xl`.
- Rewrote stale docs to current design-system source of truth:
  - `CLAUDE.md`
  - `docs/DESIGN_SYSTEM_SUMMARY.md`
  - `docs/knowledge-base/08-development/design-system.md`
  - `webapp/README.md`
- Independent Claude diff review found no blockers; Hermes addressed the non-blocking Premium/Trial visual-collapse concern.

Validation:
- `npm run verify` passed: 20 suites / 171 tests, backend build, webapp build, dependency-cruiser, madge circular scan.
- Raw palette class search in `webapp/src/**/*.tsx` returned zero matches for direct red/purple/violet/pink/lime/amber/orange/yellow/green/blue/etc. product classes.
- Screenshot audit passed with `issueCount: 0` at 375/390/412 px across:
  - `/`, `/transactions`, `/budgets`, `/more`, `/debts`, `/analytics`, `/transactions/add`, `/budgets/add`, `/debts/add`.
- Final screenshots:
  - `/tmp/ft037-design-system-closeout-390/screenshots/home-390.png`
  - `/tmp/ft037-design-system-closeout-390/screenshots/debts-390.png`
  - `/tmp/ft037-design-system-closeout-390/screenshots/add-debt-390.png`

Notes:
- `UsageLimitsCard` and `PremiumStatusCard` deliberately keep explicit `rounded-3xl` because they are feature/status cards, while default `Card` is now standard `rounded-2xl`.
- Remaining mentions of removed palettes in docs are only negative rules inside `CLAUDE.md` (do not use those palettes), not sanctioned examples.

---

## GitHub Issues Migration Criteria

- There are at least 5–10 stable backlog tasks
- Task types are consistent: `bug`, `feature`, `tech-debt`, `docs`, `design`
- We have completed 1–2 successful Hermes → Claude Code → Hermes QA iterations
- CI/build/test gates are reliable
- Shukur wants GitHub UI as primary tracking surface

---

### FT-SEM-001: Add needsReview transaction foundation

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Context:
Semantic transaction types are already stored and used by analytics/budgets/UI. The next pre-redesign blocker is trust/correction flow: uncertain transactions must be explicitly marked as needing review so analytics and future UI can avoid silently lying.

Goal:
Add a `needsReview` boolean foundation across backend domain/API/persistence and voice/text parsing. This is a data/contract slice only; avoid broad redesign.

Definition of Done:
- [x] Transaction domain/entity/API DTOs support optional `needsReview` with default `false`
- [x] SQLite/TypeORM/Supabase persistence maps `needsReview`
- [x] New migration file is created but not executed against production/Supabase
- [x] OpenAI parsing contract can return `needsReview`
- [x] Text/voice processing passes `needsReview` into transaction creation
- [x] Fast-path/simple manual quick add defaults to `needsReview: false`
- [x] Focused tests cover default false, explicit true, parser propagation
- [x] Hermes runs focused tests and `npm run verify` before marking done

Verification:
- `npm test -- tests/transactionRoutes.test.ts tests/semanticTransactionParsing.test.ts tests/processTextInput.test.ts tests/createTransaction.test.ts tests/updateTransaction.test.ts --runInBand` — passed, 5 suites / 37 tests.
- `npm run verify` — passed, 23 suites / 213 tests, webapp build, dependency-cruiser, and madge circular check.

---

### FT-SEM-002: Add semantic correction foundation

Status: ready
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Goal:
Allow users/frontends to update `semanticType` and clear `needsReview` safely, so future redesign can implement correction chips without inventing backend contracts.

Definition of Done:
- [ ] Existing update transaction flow supports `semanticType` and `needsReview`
- [ ] API validation rejects invalid semantic types and accepts valid correction payloads
- [ ] Tests cover correcting an uncertain transaction and analytics recalculation after correction
- [ ] No broad UI redesign

---

### FT-SEM-003: Weekly review foundation

Status: ready
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Goal:
Create backend/application-level weekly summary primitives that separate real expenses, income, excluded movements, reimbursements, and needs-review transactions. Do not implement final redesign yet.

Definition of Done:
- [ ] Weekly summary use case/service exists behind testable application code
- [ ] Summary separates real expenses from non-expense movements
- [ ] Needs-review transactions are exposed separately
- [ ] Tests cover own transfers, saving deposits, reimbursements, debts, cash withdrawals, and group payments

---

### FT-SEM-004: Redesign readiness QA

Status: ready
Priority: medium
Owner: Hermes, optional Claude Code browser QA
Type: qa

Goal:
Before applying the final visual redesign, verify that semantic contracts, correction foundation, and weekly summary foundation are green and documented.

Definition of Done:
- [ ] `npm run verify` passes
- [ ] Mini App build passes
- [ ] Current Telegram Mini App can be opened via tunnel
- [ ] Remaining redesign-only tasks are separated from foundation blockers

