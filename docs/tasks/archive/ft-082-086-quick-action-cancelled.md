# Архив задач — веха 9, отменённый остаток

Задачи вехи 9, которые сняты с доски 2026-10-16, когда редизайн перешёл на «Пастель» (веха 10, [`docs/pastel/`](../../pastel/README.md)). FT-082 и FT-086 были реализованы и лежат в `main`; FT-083…FT-085 не начинались.

Задач: **5**, все `cancelled`. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-086: Mobile dock — навигация отдельно от действия

Status: cancelled
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

Отмена:
Отменена 2026-10-16 по решению Д1 вехи 10: в дизайне «Пастель» нижнего бара нет — История и Аналитика открываются с главной, остальное из «Ещё» в шапке. Код бара остаётся в `main`, пока его не заменит FT-110.

---

### FT-082: More page quick-action hub

Status: cancelled
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

Отмена:
Отменена 2026-10-16 по решению Д1 вехи 10: «Ещё» в «Пастели» — список разделов и настроек (Деньги, Бот в Telegram, Вид, Данные). Код страницы остаётся в `main`, пока его не заменит FT-125.

---

### FT-083: Remove dashboard dependency from Home

Status: cancelled
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

Отмена:
Отменена 2026-10-16 по решению Д1 вехи 10: новая главная (FT-111) убирает `AttentionSummary` и зависимость от `dashboard`.

---

### FT-084: Saved toast and real undo decision

Status: cancelled
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

Отмена:
Отменена 2026-10-16 по решению Д1 вехи 10: Toast с настоящей отменой — FT-094 (стопка отмен) и FT-105 (мягкое удаление и восстановление).

---

### FT-085: Dark theme pair for quick-action UI

Status: cancelled
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

Отмена:
Отменена 2026-10-16 по решению Д1 вехи 10: светлая и тёмная тема «Пастели» — FT-092.
