# Finance Tracker — Task Board

Активная доска. Здесь только живая работа: задача в работе, очередь за ней и список отложенного.
Закрытые задачи сюда не возвращаются.

| Что нужно | Где смотреть |
|---|---|
| Как устроена доска, статусы, роли | [`docs/tasks/README.md`](docs/tasks/README.md) |
| Почему план такой — лог решений | [`docs/tasks/decisions.md`](docs/tasks/decisions.md) |
| Отложенные задачи, полные описания (10) | [`docs/tasks/backlog.md`](docs/tasks/backlog.md) |
| Закрытые задачи с отчётами (102) | [`docs/tasks/archive/`](docs/tasks/archive/) |

---

## Текущий фокус — веха 9: редизайн Mini App вокруг quick action

Полный редизайн Mini App вокруг быстрого действия. План: `.hermes/plans/2026-09-04_173401-quick-action-ui-redesign-roadmap.md`.

Бюджеты, долги, аналитика и premium остаются вторичными и живут под «Ещё» — не возвращать их в primary UX.
Все не-quick-action задачи Шукур перенёс в backlog 2026-09-04; не начинать их без явного запроса.

Прогресс вехи: FT-077 ✅ · FT-078 ✅ · FT-079 ✅ · FT-080 ✅ · **FT-081 в работе** · FT-082 · FT-083 · FT-084 · FT-085

### Постоянный контекст

- Прод и AWS выключены намеренно и в планы не входят (решение 2026-08-13). Рантайм — локальный WSL + SQLite + Telegram polling + Cloudflare quick tunnel для теста Mini App с телефона.
- Supabase-проект на паузе, не удалён. Локально `DATABASE_TYPE=sqlite`.
- Все исторические транзакции имеют `semanticType = expense`. Backfill **не применялся**: FT-045 сделал только read-only превью, реальный backfill требует отдельного решения Шукура.

---

## В работе

### FT-081: History page daily-correction redesign

Status: in_progress
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
`/transactions` should become a quick History/correction surface: recent-first, day groups, day totals, compact rows. Archive and bulk actions are still useful but should not define the primary daily UX.

Definition of Done:
- [ ] History reads as daily correction/review, not admin management
- [ ] Search/filter are quieter and do not dominate the empty state
- [ ] Archive/bulk actions remain available but secondary
- [ ] Compact row component is reused or aligned with Home recent rows
- [ ] Screenshot QA: History at 375 / 390 / 412, empty and populated states
- [ ] `npm run verify` passes

Незакоммиченные изменения в рабочем дереве на 2026-09-06:

- `webapp/src/entities/transaction/lib/dayGroupSummary.ts` (+ тест)
- `webapp/src/pages/transactions/ui/HistoryDayGroup.tsx`
- `webapp/src/entities/transaction/lib/transactionRowDisplay.ts` (+ тест)
- `webapp/src/entities/transaction/lib/transactionCountLabels.ts` (+ тест)
- `webapp/src/entities/transaction/ui/CompactTransactionRow.tsx`
- `webapp/src/features/filter-transactions/ui/FilterBar.tsx`
- `webapp/src/entities/transaction/index.ts`

---

## Очередь

Порядок обязателен: следующая берётся только после того, как Hermes закрыл предыдущую.

### FT-082: More page quick-action hub

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
More currently only lists old feature pages. It should become the secondary hub for capture channels/settings plus non-daily sections. Working budgets/debts/analytics must not be presented as broken; they are just not primary.

Definition of Done:
- [ ] More groups capture channels, actual settings, and “not daily” sections
- [ ] Telegram bot / iPhone Shortcut / Mini App text capture are represented clearly
- [ ] Budgets, debts and analytics remain reachable as secondary links
- [ ] No fake toggles/settings that do not persist
- [ ] Screenshot QA: More at 375 / 390 / 412
- [ ] `npm run verify` passes

---

### FT-083: Remove dashboard dependency from Home

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui/performance

Context:
Home visually hides dashboard blocks but `AttentionSummary` and dock prefetch still depend on dashboard/budget/analytics-shaped data. Quick-action Home should avoid heavy dashboard dependencies unless a real signal is needed.

Definition of Done:
- [ ] Home no longer fetches dashboard data only for daily capture chrome
- [ ] Review/attention signal is derived from transaction/review data already needed by Home, or deferred if not available
- [ ] Budgets/analytics do not leak back into Home via attention copy
- [ ] No backend change unless separately approved
- [ ] `npm run verify` passes

---

### FT-084: Saved toast and real undo decision

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
Speed-first capture needs fast feedback. A saved toast is useful; Undo is only acceptable if it calls a real delete path and updates caches. Do not render decorative Undo.

Definition of Done:
- [ ] Capture success shows compact, non-blocking saved feedback
- [ ] `needsReview` and `no_transaction` remain clearly distinct
- [ ] Undo is either omitted or wired to real delete + cache update
- [ ] No fake action hints
- [ ] Tests cover feedback/action behavior
- [ ] Screenshot QA: saved, needs-review and error states
- [ ] `npm run verify` passes

---

### FT-085: Dark theme pair for quick-action UI

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: design-system

Context:
The chosen Claude Design direction is dark-first, but the repo is currently light-only. Dark theme should be a separate, explicit slice after the quick-action posture is working.

Definition of Done:
- [ ] `.dark` tokens or equivalent theme pair implemented deliberately
- [ ] Onest remains self-hosted; no Google Fonts/CDN regression
- [ ] Telegram theme behavior is decided and implemented if in scope
- [ ] Light and dark screenshots at 375 / 390 / 412 pass visual QA
- [ ] `npm run verify` passes

---

## Backlog — не начинать без явного запроса

Полные описания: [`docs/tasks/backlog.md`](docs/tasks/backlog.md).

| Задача | Суть | Чего ждёт |
|---|---|---|
| [FT-046](docs/tasks/backlog.md) | Применить Supabase-миграции 007 и 008 | живой Supabase; проект на паузе |
| [FT-048](docs/tasks/backlog.md) | Апгрейд sqlite3 до v6 | breaking-change апгрейд, отдельное решение |
| [FT-049](docs/tasks/backlog.md) | Свести доску с GitHub Issues | разрешение на внешние действия в GitHub |
| [FT-050](docs/tasks/backlog.md) | Разобрать мёртвые ветки | решение 2026-09-05: не удалять; инвентарь снят |
| [FT-051](docs/tasks/backlog.md) | Система внимания P1 и скорость ввода | продуктовое решение Шукура |
| [FT-054](docs/tasks/backlog.md) | Semantic type в ручной форме транзакции | продуктовое решение Шукура |
| [FT-062](docs/tasks/backlog.md) | Состав главного экрана и приоритет секций | продуктовое решение; пересекается с вехой 9 |
| [FT-063](docs/tasks/backlog.md) | Сроки долгов и напоминания | продуктовое решение Шукура |
| [FT-069](docs/tasks/backlog.md) | Граница premium некогерентна и обходится | политика монетизации |
| [FT-071](docs/tasks/backlog.md) | Rate limits тесноваты под реальное использование | политика лимитов |

---

## Что уже закрыто

102 задачи: вехи 0–8 и весь отрезок до того, как появились вехи. Полные отчёты «Реализовано / Проверка» — в архиве.

| Отрезок | Задачи | Файл |
|---|---|---|
| Фундамент: стабилизация, аудиты, архитектура | FT-000…FT-024 | [`ft-000-024-foundation.md`](docs/tasks/archive/ft-000-024-foundation.md) |
| Продукт и UI: дизайн-система, вёрстка, ввод | FT-025…FT-041 | [`ft-025-041-product-ui.md`](docs/tasks/archive/ft-025-041-product-ui.md) |
| Семантические транзакции | FT-SEM-001…006 | [`ft-sem-semantic-transactions.md`](docs/tasks/archive/ft-sem-semantic-transactions.md) |
| Relaunch: локальный контур и доверие к цифрам | FT-042…FT-072 | [`ft-042-072-relaunch.md`](docs/tasks/archive/ft-042-072-relaunch.md) |
| Quick capture и первые срезы редизайна | FT-073…FT-080 | [`ft-073-080-quick-action.md`](docs/tasks/archive/ft-073-080-quick-action.md) |
