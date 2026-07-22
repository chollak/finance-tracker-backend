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

### FT-004: Decide first product vector after stabilization

Status: blocked
Priority: high
Owner: Shukur + Hermes
Type: product

Context:
After repo hygiene and audit, choose the next product direction.

Candidate vectors:
- Improve personal weekly finance review workflow
- Stabilize core transaction/userId model
- Improve Telegram bot UX
- Improve Telegram Mini App UX
- Import bank/card statements or CSV
- Production readiness and CI/CD

Blocked by:
- Completion of FT-001 audit
- Shukur's product preference

---

## GitHub Issues Migration Criteria

Move this board to GitHub Issues when:

- There are at least 5–10 stable backlog tasks
- Task types are consistent: `bug`, `feature`, `tech-debt`, `docs`, `design`
- We have completed 1–2 successful Hermes → Claude Code → Hermes QA iterations
- CI/build/test gates are reliable
- Shukur wants GitHub UI as primary tracking surface
