# Task Workflow Decision

> Status: current project workflow decision. Applies until Shukur explicitly chooses GitHub Issues as the primary planning UI.

## Decision

Keep `TASKS.md` as the source of truth for now.

Do not migrate the backlog to GitHub Issues yet.

## Why

The project is still transitioning from foundation cleanup into product feature development. During this phase, a local task board is faster and less noisy because:

- Hermes can update it atomically with code/docs/report changes.
- It stays close to the repository context.
- It avoids creating external GitHub issue noise for tasks that are still being reshaped.
- Current environment does not have `gh` installed, so GitHub Issues would require extra auth/tooling setup or API calls.
- Shukur has not explicitly chosen GitHub UI as the primary tracking surface.

## Current Source of Truth

Primary task board:

```text
TASKS.md
```

Execution/report log:

```text
AUTONOMOUS_REPORT.md
```

Detailed decision/planning docs:

```text
docs/knowledge-base/
.hermes/plans/
```

## How to Use `TASKS.md`

`TASKS.md` should remain a high-level dashboard, not a raw activity log.

Use it for:

- task status
- priority
- owner
- concise goal
- definition of done
- important implementation notes
- links to detailed docs

Do not use it for:

- large tool outputs
- full test logs
- long debugging transcripts
- duplicated report text

## How to Use `AUTONOMOUS_REPORT.md`

Use it as the durable chronological work log.

Include:

- what changed
- why it changed
- verification commands/results
- findings and follow-ups
- commit references when useful

Avoid:

- secrets
- raw `.env` values
- huge logs
- transient scratch notes

## When to Move to GitHub Issues

Move to GitHub Issues when most of these are true:

- Shukur wants GitHub UI as the primary task surface.
- There is a stable product backlog, not just foundation cleanup.
- Tasks are small enough to become independently trackable issues.
- Labels are clear and few.
- GitHub tooling/auth is available locally or through configured automation.
- We need collaboration/review outside this local Hermes workflow.

## Recommended Labels Later

Keep labels simple:

```text
foundation
feature
bug
tech-debt
docs
test
blocked
```

Avoid over-labeling early.

## GitHub Issues Migration Plan Later

When ready:

1. Keep `TASKS.md` as a dashboard/index.
2. Create GitHub Issues only for active or upcoming work, not every historical completed task.
3. Use one issue per independently shippable task.
4. Link issue IDs back from `TASKS.md`.
5. Keep `AUTONOMOUS_REPORT.md` for detailed run logs unless GitHub issue comments become the preferred log.

## Current Backlog Handling

Short-term:

- Keep foundation tasks in `TASKS.md`.
- Keep findings docs in `docs/knowledge-base/`.
- Start product backlog only after Shukur chooses the product direction.

Recommended next decision after foundation:

```text
FT-004: Decide first product vector after stabilization
```

Candidate vectors are still tracked in `TASKS.md`.

## Non-Goals

This decision does not:

- create GitHub Issues
- create labels/milestones/projects
- change CI/deploy behavior
- require `gh` installation
- move historical task history out of the repository
