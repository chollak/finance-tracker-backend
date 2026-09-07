# Finance Tracker — Task Board

Активная доска. Здесь только живая работа: задача в работе, очередь за ней и список отложенного.
Закрытые задачи сюда не возвращаются.

| Что нужно | Где смотреть |
|---|---|
| Как устроена доска, статусы, роли | [`docs/tasks/README.md`](docs/tasks/README.md) |
| Почему план такой — лог решений | [`docs/tasks/decisions.md`](docs/tasks/decisions.md) |
| Отложенные задачи, полные описания (10) | [`docs/tasks/backlog.md`](docs/tasks/backlog.md) |
| Закрытые задачи с отчётами (103) | [`docs/tasks/archive/`](docs/tasks/archive/) |

---

## Текущий фокус — веха 9: редизайн Mini App вокруг quick action

Полный редизайн Mini App вокруг быстрого действия. План: `.hermes/plans/2026-09-04_173401-quick-action-ui-redesign-roadmap.md`.

Бюджеты, долги, аналитика и premium остаются вторичными и живут под «Ещё» — не возвращать их в primary UX.
Все не-quick-action задачи Шукур перенёс в backlog 2026-09-04; не начинать их без явного запроса.

Прогресс вехи: FT-077 ✅ · FT-078 ✅ · FT-079 ✅ · FT-080 ✅ · FT-081 ✅ · **FT-086 на проверке** · **FT-082 на проверке** · FT-083 · FT-084 · FT-085

FT-086 добавлена 2026-09-07 по запросу Шукура: мобильная навигация не была запланирована в вехе 9,
но док мешает тому же quick-action флоу, ради которого веха и делается. Идёт перед FT-082, потому
что задаёт, что вообще попадает в «Ещё».

### Где мы по дизайну навигации (2026-09-07)

Канвас с вариантами: https://claude.ai/code/artifact/f47bd089-ccbf-4fd5-9c62-a04ae055deea
(текущий док + четыре варианта A–D, у каждого мотив и цена).

Выбран **B** — четыре равных слота в прижатом баре, реализован в `FT-086`. Как к нему пришли:

- **C (FAB над баром) вычеркнут брифом.** `style-direction.md` прямо запрещает creation actions,
  плавающие над нижним навом.
- **F (без глобального действия) вычеркнут брифом.** Тот же документ требует «One global mobile
  primary action».
- **A/E (нативная кнопка Telegram) остаются открытыми.** A не убирает дубль «Записать»: на
  главной у карточки ввода есть своя кнопка отправки, и нативная либо дублирует её, либо
  исчезает — и тогда действие перестаёт быть в постоянном месте. E решает это, отдавая
  отправку нативной кнопке целиком, но трогает карточку из `FT-078` и требует запасного пути
  вне Telegram. **E снимается с текущего бара без переделки** — он надстройка, не альтернатива.

Скилл `frontend-design` установлен (`~/.claude/skills/frontend-design/`, из
`anthropics/claude-code`). В сессии, где он поставлен, не регистрируется — нужен перезапуск.

Открытые вопросы записаны в `docs/knowledge-base/10-design-guidelines/style-direction.md`,
раздел «Open design questions».

### Постоянный контекст

- Прод и AWS выключены намеренно и в планы не входят (решение 2026-08-13). Рантайм — локальный WSL + SQLite + Telegram polling + Cloudflare quick tunnel для теста Mini App с телефона.
- Supabase-проект на паузе, не удалён. Локально `DATABASE_TYPE=sqlite`.
- Все исторические транзакции имеют `semanticType = expense`. Backfill **не применялся**: FT-045 сделал только read-only превью, реальный backfill требует отдельного решения Шукура.

---

## В работе

Обе задачи ниже реализованы и ждут проверки Шукура. В `done` и в архив уходят по его слову.

### FT-086: Mobile dock — навигация отдельно от действия

Status: review
Priority: medium
Owner: Claude Code, QA by Шукур
Type: quick-action-ui

Context:
Док смешал навигацию и действие в одном ряду, и от этого страдают оба. Замеры на живой странице
(375/390/412): пять целей, подписана одна; `+` (ручная форма) стоит вплотную к `Записать`, то есть
два «создать» рядом, причём медленный флоу носит самый универсальный знак «добавить»; иконка
Истории — `Receipt`, тот же «чек», что и недоступный канал записи в карточке ввода; активная
вкладка — `bg-primary/5`, то есть 5% чёрного, читается только по оттенку иконки; вся навигация
сделана `<button>` + `navigate()` (`links: 0`, `aria-pressed` вместо `aria-current`); тень
`shadow-2xl` при том, что «Heavy shadows» — антипаттерн в `design-guidelines.md`; нав плюс
градиентный скрим занимают 99px + 112px, ~13% экрана на 844px.

Задача про **мобильный док**. Десктопный `TopNav` показывает другую IA (Бюджеты/Долги/Аналитика
первым уровнем вопреки вехе 9) — это отдельное продуктовое решение, в этот срез не входит.

`+` — единственный вход в ручную форму на мобильном: FAB на Home и History оба `hidden md:flex`.
Поэтому убрать его можно только вместе с новым входом.

Definition of Done:
- [x] `+` убран из дока, ручная форма остаётся достижимой с мобильного
- [x] Вкладки подписаны: Главная / История / Ещё
- [x] Активное состояние читается без подписи-догадки
- [x] Вкладки — ссылки (`<Link>`), работает Ctrl/средний клик; `aria-current="page"` вместо `aria-pressed`
- [x] Иконка Истории больше не совпадает с каналом записи «Чек»
- [x] Разделители убраны, тень в рамках гайдлайнов, скрим ниже
- [x] Тач-таргеты >= 44px на 375/390/412
- [x] Скриншот-QA дока на 375/390/412, активное состояние на каждом маршруте
- [x] `npm run verify` проходит

Пересмотр 2026-09-07 — плавающий док заменён прижатым баром:

Первая версия оставляла док плавающей карточкой и лечила симптомы. Разбор по методу
`frontend-design` показал, что форма была неверной с самого начала: в
`docs/knowledge-base/10-design-guidelines/design-guidelines.md` **лежит собственная спека
нижней навигации** — прижатый к низу бар во всю ширину, `border-t`, `justify-around`, стопка
«иконка + подпись». Плавающая карточка с `max-w-sm`, радиусом 26px и тенью была отступлением
от неё, а не следованием.

Итог: 4 равных слота (Главная · История · Записать · Ещё) в глухом баре, прижатом к низу.
Действие сохранило место и имя, но отдало размер — из широкой чёрной пилюли стало залитым
диском 26px с подписью, как у остальных. Причина в принципе «трать смелость в одном месте»:
смелость этого приложения уже потрачена на сумму дня и карточку ввода, а док забирал её себе.

Замеры до → после:

| | было | стало |
|---|---|---|
| Высота нава | 95px + скрим 80px (~13% экрана) | 59px (~7%) |
| Слоты | 2 + пилюля + 1, перекос влево | 4 равных, 92×58 |
| Просвечивание | контент читался под доком | глухой бар, скрим удалён |

Осознанное отступление от гайдлайна: спека предписывает `bg-card/80 backdrop-blur-lg`, но
`card` и `background` в проекте оба чисто белые — фростить нечего, и контент читался сквозь бар
и на 85%, и на 95%. Бар сделан глухим, блюр убран. Это служит той же цели документа
(«no visual noise»), но расходится с его буквой; причина записана в `dock.tsx`.

Побочно: когда бар стал непрозрачным, активная вкладка потеряла подложку — она была `-z-10`, и
её удерживал только `backdrop-blur`, случайно создававший контекст наложения. Перестроено без
опоры на негативный z. `DockSplit` и `DockSeparator` удалены: они существовали ради удержания
центра на оси, а в четырёх равных слотах центрировать нечего.

Не входило в срез: десктопный `TopNav` по-прежнему показывает другую IA
(Бюджеты/Долги/Аналитика первым уровнем вопреки вехе 9) — отдельное продуктовое решение.

---

### FT-082: More page quick-action hub

Status: review
Priority: medium
Owner: Claude Code, QA by Шукур
Type: quick-action-ui

Context:
More currently only lists old feature pages. It should become the secondary hub for capture channels/settings plus non-daily sections. Working budgets/debts/analytics must not be presented as broken; they are just not primary.

Definition of Done:
- [x] More groups capture channels, actual settings, and “not daily” sections
- [x] Telegram bot / iPhone Shortcut / Mini App text capture are represented clearly
- [x] Budgets, debts and analytics remain reachable as secondary links
- [x] No fake toggles/settings that do not persist
- [x] Screenshot QA: More at 375 / 390 / 412
- [x] `npm run verify` passes

Замечание по DoD: пункт про «actual settings» закрыт тем, что **настроек в приложении нет** — ни
маршрута, ни сохраняемых значений. Группа «Настройки» не сделана намеренно: пустой раздел или
тумблер, забывающий себя при перезагрузке, — это ровно та фейковая возможность, которую веха
запрещает. Вместо неё есть «Аккаунт» с реальным состоянием (кто вы / гостевой режим + вход).

---

## Очередь

Порядок обязателен: следующая берётся только после того, как задача перед ней закрыта.

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

103 задачи: вехи 0–8 и весь отрезок до того, как появились вехи. Полные отчёты «Реализовано / Проверка» — в архиве.

| Отрезок | Задачи | Файл |
|---|---|---|
| Фундамент: стабилизация, аудиты, архитектура | FT-000…FT-024 | [`ft-000-024-foundation.md`](docs/tasks/archive/ft-000-024-foundation.md) |
| Продукт и UI: дизайн-система, вёрстка, ввод | FT-025…FT-041 | [`ft-025-041-product-ui.md`](docs/tasks/archive/ft-025-041-product-ui.md) |
| Семантические транзакции | FT-SEM-001…006 | [`ft-sem-semantic-transactions.md`](docs/tasks/archive/ft-sem-semantic-transactions.md) |
| Relaunch: локальный контур и доверие к цифрам | FT-042…FT-072 | [`ft-042-072-relaunch.md`](docs/tasks/archive/ft-042-072-relaunch.md) |
| Quick capture и первые срезы редизайна | FT-073…FT-081 | [`ft-073-081-quick-action.md`](docs/tasks/archive/ft-073-081-quick-action.md) |
