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

Status: pending
Priority: high
Owner: Hermes + Claude Code
Type: foundation/tests

Goal:
Add tests around debt, subscription, user, and critical API route behavior before product features.

Definition of Done:
- [ ] Debt module core behavior tested
- [ ] Subscription/limits/trial behavior tested
- [ ] User resolution/guest behavior tested
- [ ] Critical API route behavior tested where practical
- [ ] TDD followed for new tests/behavior

---

### FT-015: Runtime/process mode decision document

Status: pending
Priority: medium
Owner: Hermes
Type: foundation/architecture

Goal:
Decide how API, Telegram bot, and future worker should run before implementing background jobs.

Definition of Done:
- [ ] Options documented: single process vs `APP_MODE=all|api|bot|worker` vs split entrypoints
- [ ] Recommendation recorded
- [ ] No scheduler/product automation implemented yet

---

### FT-016: GitHub task workflow foundation

Status: pending
Priority: medium
Owner: Hermes
Type: foundation/workflow

Goal:
Decide whether to keep local `TASKS.md` as source of truth or migrate FT-011..FT-016 to GitHub Issues.

Definition of Done:
- [ ] Decision recorded
- [ ] If GitHub Issues are created, labels are simple and useful
- [ ] `TASKS.md` remains high-level dashboard

---

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
