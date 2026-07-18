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

Status: review
Priority: high
Owner: Hermes
Type: audit

Goal:
Understand the current state of backend, Telegram bot, webapp, docs, tests, CI, architecture, and product direction before delegating development to Claude Code.

Definition of Done:
- [x] Read `CLAUDE.md`, `README.md`, `package.json`, `webapp/package.json`
- [x] Run baseline checks: backend build, backend tests, webapp build, architecture analyze
- [ ] Summarize actual architecture and product state
- [ ] Identify stale docs vs current implementation
- [ ] Identify first safe development tasks for Claude Code
- [ ] Produce short roadmap

Verification so far:
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

Status: backlog
Priority: medium
Owner: Hermes + Claude Code
Type: docs

Context:
Some docs appear stale. Example: `docs/VISION.md` marks DebtModule and SubscriptionModule as TODO, while `CLAUDE.md` and source code show those modules already exist.

Definition of Done:
- Identify stale sections across `docs/`, `README.md`, `CLAUDE.md`, `AUDIT.md`
- Update docs to match actual code state
- Preserve useful Claude Code guidance
- Add clear “current status” and “next roadmap” sections

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
