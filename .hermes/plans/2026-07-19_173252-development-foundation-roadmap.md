# Development Foundation Roadmap

> **For Hermes:** Use this plan as the implementation roadmap before starting product features. Do not implement subscription expiry automation yet unless Shukur explicitly re-prioritizes it.

**Goal:** Prepare `finance-tracker-backend` for steady feature development with reliable gates, clear task flow, safer config, and better test coverage.

**Architecture:** Keep the current MVP architecture intact. Improve the foundation around it: CI/quality gates, task/report discipline, test safety net, env/deploy clarity, and module boundary checks. Avoid broad rewrites.

**Tech Stack:** Node.js 20, TypeScript, Express, Telegraf, TypeORM, SQLite/Supabase, React/Vite webapp, Jest, dependency-cruiser, madge, GitHub Actions.

---

## Current Context

Completed stabilization/cleanup:

- FT-000/001/002/003/005: baseline, architecture checks, docs consistency.
- FT-007: removed obsolete legacy migration surface.
- FT-008: separated tracked learning seed data from ignored runtime learning data.
- FT-009: removed unused dependencies and obsolete migration scripts.
- FT-010: removed confirmed unused orphan/barrel files.

Current green checks:

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

Known intentional deferral:

- `SubscriptionService.processExpiredSubscriptions()` scheduler/worker is a real product/business gap, but Shukur said not to do it yet.

---

## Foundation Priorities

### FT-011: CI quality gate consolidation

**Objective:** Make GitHub Actions match Hermes local verification before deploy.

**Why:** Existing `deploy.yml` only runs tests and webapp build before deploying. It does not run backend build or architecture checks.

**Files likely to change:**

- `.github/workflows/deploy.yml`
- maybe create `.github/workflows/ci.yml` if we separate CI from deploy
- `TASKS.md`
- `AUTONOMOUS_REPORT.md`

**Target checks:**

```bash
npm ci
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

**Acceptance criteria:**

- PR/push CI runs the same quality gate Hermes uses locally.
- Deploy depends on passing CI/build/analyze.
- No secret values are printed.
- Commit/push only after local verification.

---

### FT-012: Standardize project command surface

**Objective:** Make package scripts explicit and agent-friendly.

**Why:** Hermes/Claude/future CI should have one obvious command for full verification.

**Files likely to change:**

- `package.json`
- `package-lock.json` only if npm changes dependencies/scripts metadata
- `README.md`
- `CLAUDE.md`
- `docs/knowledge-base/08-development/quick-start.md`

**Proposed scripts:**

```json
{
  "typecheck": "npm run build",
  "test:ci": "jest --runInBand",
  "verify": "npm run build && npm run test:ci && npm run build:webapp && npm run analyze"
}
```

**Acceptance criteria:**

- `npm run verify` passes locally.
- Docs tell agents/users to run `npm run verify` before commit/push.
- Existing scripts continue to work.

---

### FT-013: Environment/config cleanup

**Objective:** Make env loading rules simple and documented.

**Why:** `AppConfig` currently loads `.env.local` then `.env`; `.env.development` exists but is not clearly part of runtime loading. This can confuse local/dev/deploy behavior.

**Files likely to inspect/change:**

- `src/shared/infrastructure/config/appConfig.ts`
- `.env.example`
- `.env.development`
- `.gitignore`
- `README.md`
- `DEPLOYMENT.md`
- `docs/knowledge-base/08-development/quick-start.md`

**Acceptance criteria:**

- Clear rule for `.env`, `.env.local`, `.env.development`.
- No secrets are committed or printed.
- Example env file remains safe.
- App startup behavior is documented.

---

### FT-014: Test safety net for core modules

**Objective:** Add tests around risky modules before product features.

**Why:** Current tests are mostly transaction/budget/dashboard/voice text flow. There are no direct tests for debt, subscription/payment/trial limits, user module, Telegram handlers, or API route integration.

**Initial test targets:**

1. Debt module use cases:
   - create debt
   - pay partial/full debt
   - linked transaction behavior if applicable
2. Subscription module use cases:
   - free limits
   - premium grant
   - trial start rules
   - usage increment/decrement
3. User module:
   - telegramId → UUID resolution
   - guest user handling
4. Critical API routes:
   - transaction create/get user transactions
   - debt create/pay
   - subscription check-limit

**Acceptance criteria:**

- Use TDD for each behavior.
- Keep tests fast and deterministic.
- `npm run verify` passes.

---

### FT-015: Runtime/process mode decision document

**Objective:** Decide how to run API, bot, and future worker modes before adding background jobs.

**Why:** `src/index.ts` currently starts HTTP server + Telegram bot in one process. That is okay for MVP, but feature development will soon need background behavior. We need a direction before implementation.

**Options to evaluate:**

- Keep single process for now.
- Add `APP_MODE=all|api|bot|worker`.
- Split entrypoints later: `src/index.ts`, `src/bot.ts`, `src/worker.ts`.

**Acceptance criteria:**

- Decision recorded in `AUTONOMOUS_REPORT.md` / docs.
- No implementation unless the decision is clear and useful now.
- Subscription expiry automation remains deferred unless explicitly approved.

---

### FT-016: GitHub task workflow foundation

**Objective:** Decide when/how to move from local `TASKS.md` to GitHub Issues.

**Why:** Project now has enough stable backlog tasks. GitHub Issues can become useful if we keep labels/milestones simple.

**Possible labels:**

- `foundation`
- `test`
- `tech-debt`
- `docs`
- `feature`
- `blocked`

**Acceptance criteria:**

- Either keep local board for now with a clear reason, or create GitHub Issues for FT-011..FT-016.
- Keep `TASKS.md` as summary/dashboard even if Issues become source of truth.

---

## Recommended Execution Order

1. **FT-011: CI quality gate consolidation**
2. **FT-012: Standardize project command surface**
3. **FT-013: Environment/config cleanup**
4. **FT-014: Test safety net for core modules**
5. **FT-015: Runtime/process mode decision document**
6. **FT-016: GitHub task workflow foundation**

## Verification Standard for Each Foundation Task

Before commit/push:

```bash
npm run build
npm test -- --runInBand
npm run build:webapp
npm run analyze
```

After FT-012, replace this with:

```bash
npm run verify
```

## Notes for Claude Code Delegation

When delegating implementation tasks to Claude Code:

- One task at a time.
- Context → constraints → DoD → verification.
- Claude does not commit/push.
- Hermes reviews diff and runs verification.
- Hermes updates `TASKS.md` and `AUTONOMOUS_REPORT.md` before commit/push.

## Risks

- CI changes can accidentally deploy on push; prefer separating CI from deploy or making deploy depend on explicit success gates.
- Env cleanup can accidentally touch secrets; never print `.env` values.
- Test expansion can overfit implementation; test behavior/use cases, not private internals.
- Runtime mode split can become premature architecture work; document first, implement only when needed.
