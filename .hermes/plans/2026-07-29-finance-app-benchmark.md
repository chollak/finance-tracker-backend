# Finance App Benchmark — Research Pass

Date: 2026-07-29
Scope: Wallet by BudgetBakers, Money Manager, YNAB, Copilot Money, Rocket Money, Splitwise, Revolut, TBC/Payme/Click.

## 1. Sources checked

### Global personal finance / budgeting

- Wallet by BudgetBakers:
  - https://budgetbakers.com/en/products/wallet/
  - https://budgetbakers.com/en/products/wallet/features/
  - https://budgetbakers.com/en/products/wallet/download/
  - https://play.google.com/store/apps/details?id=com.droid4you.application.wallet
  - https://apps.apple.com/us/app/wallet-daily-budget-profit/id1032467659
- Money Manager Expense & Budget:
  - https://www.realbyteapps.com/
  - https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree
  - https://apps.apple.com/us/app/money-manager-expense-budget/id560481810
- YNAB:
  - https://www.ynab.com/features
  - https://www.ynab.com/pricing
  - https://www.ynab.com/ynab-method
  - https://play.google.com/store/apps/details?id=com.youneedabudget.evergreen.app
  - https://apps.apple.com/us/app/ynab/id1010865877

### Premium automation / subscriptions / debts

- Copilot Money: https://www.copilot.money
- Rocket Money:
  - https://www.rocketmoney.com/
  - https://www.rocketmoney.com/feature/manage-subscriptions
  - https://www.rocketmoney.com/feature/create-a-budget
  - https://www.rocketmoney.com/feature/spending-insights
  - https://www.rocketmoney.com/feature/autopilot-savings
  - https://www.rocketmoney.com/feature/lower-your-bills
  - https://www.rocketmoney.com/terms
- Splitwise:
  - https://www.splitwise.com/
  - https://www.splitwise.com/pro

### Mobile banking / Uzbekistan context

- Revolut:
  - https://www.revolut.com/best-budget-planner/
  - https://help.revolut.com/en-US/help/accounts/budget-and-analytics/how-can-i-see-my-spending-and-income-analytics/
  - https://www.revolut.com/cards/
  - Note: direct access returned 403/security check, facts were read from the same official URLs through text proxy `r.jina.ai`.
- TBC Bank UZ:
  - https://tbcbank.uz/ru/
  - https://tbcbank.uz/ru/cards/
  - https://tbcbank.uz/ru/product/mezhdunarodnye-perevody/
- Payme:
  - https://payme.uz/ru
  - https://payme.uz/assets/i18n/ru.json
- Click:
  - https://click.uz/ru
  - https://click.uz/ru/cashback
  - https://click.uz/ru/auto-payment
  - https://click.uz/ru/payment-on-spot
  - https://click.uz/ru/perevod-s-karti-na-kartu
  - https://click.uz/ru/myfamily
  - https://click.uz/ru/news/203/oplata-topliva-po-qrkodu-cherez-click

### Local product inspection

- Current app screenshots captured via Playwright:
  - `/tmp/finance-benchmark/home.png`
  - `/tmp/finance-benchmark/transactions.png`
  - `/tmp/finance-benchmark/budgets.png`
  - `/tmp/finance-benchmark/more.png`
  - `/tmp/finance-benchmark/debts.png`
  - `/tmp/finance-benchmark/analytics.png`

## 2. Current Mini App snapshot

Observed pages:

- **Home:** guest banner, “Чистый поток”, quick stats, usage limits, budget overview, recent transactions, centered bottom dock.
- **Transactions:** active/hidden tabs, search, type/category filter, grouped list, empty state with first-transaction CTA.
- **Budgets:** login-gated for guest; copy promises category budgets, limits and over-budget alerts.
- **More:** simple two-item list for Debts and Analytics.
- **Debts:** login-gated for guest; authenticated state has “Я должен / Мне должны”, net balance, filters and debt list.
- **Analytics:** login-gated for guest; authenticated state has financial health, spending chart, monthly trends.

Current product stance:

> Telegram-first personal finance assistant: quickly captures expenses, separates real spending from transfers/debts/savings/reimbursements, and explains where money went every week.

This is stronger than a generic “expense tracker” because it matches the user’s actual pain: weekly review correctness and low-friction Telegram capture.

## 3. Product-by-product findings

| Product | Positioning | Strongest pattern | Copy for Mini App | Avoid in MVP |
|---|---|---|---|---|
| **Wallet by BudgetBakers** | Full personal/family finance manager | All finances in one place: accounts, budgets, reports, bills, debts, investments, multicurrency | Budget progress bars, limit alerts, planned/recurring payments, dashboard cards: money now / month spend / budget remaining | Mandatory bank sync, investments, complex account universe, heavy reports |
| **Money Manager** | Manual-first expense tracker / personal asset manager | Very fast daily manual tracking; calendar and category stats | Fast add, templates/bookmarks for frequent expenses, calendar/month review, simple account-category-amount-date-note model | Explicit double-entry accounting, dense tables/filters on mobile |
| **YNAB** | Budgeting method / behavior change | “Assign every dollar” and adjust categories as priorities change | Goals/targets, flexible budget transfers, onboarding question: “what should this money do before next income?”, micro-education | Full YNAB methodology, steep learning curve, subscription before value is proven |
| **Copilot Money** | Premium beautiful automated tracker | Polished dashboard, smart automation, AI categorization, cashflow, rollovers, net worth | Beautiful dashboard, emoji categories, cash-flow cards, rollovers, demo mode before setup | Bank/investment/real-estate integrations early, premium complexity |
| **Rocket Money** | Save money via subscriptions, budgets and concierge | Finds recurring subscriptions/bills and frames “money leaks” | Recurring payment detection, upcoming charge alerts, low-balance style alerts, rules for recurring merchant/name, weekly savings insights | Concierge cancellation, bill negotiation, autopilot savings, banking actions |
| **Splitwise** | Shared expenses and social debts | “Who owes whom”, groups, trips, settle-up, simplify debts | Person-first debts, Telegram chat groups, equal/unequal split, recurring group expenses, settle-up flow, receipt itemization as premium | Too many split modes on first screen, harsh free limits in a lightweight Telegram context |
| **Revolut** | Mobile bank with money management | Fast answer to “where did money go?” by category/merchant/period/card/country/currency | Mini-dashboard, spending by period, category/merchant comparisons, custom categories, quick actions | Investment/crypto/net-worth bloat, Europe-only mental model |
| **TBC UZ** | Uzbekistan mobile bank around cards | Card-first UX: cards, transfers, payment history, virtual cards, cashback, balances | Card/account mental model, Uzcard/Humo/Visa labels, quick actions: transfer, top up, pay, history | Ignoring local card/payment expectations |
| **Payme** | Card-based payments and monitoring | Payment monitoring, service payments, QR, transfer/payment history, notes, categories | Notes on operations, categories, multiple cards, payment monitoring, QR/request-money patterns | Hiding history/analytics too deep |
| **Click** | Uzbekistan SuperApp | Customizable home, transfers by phone/card, wallet, cashback, autopay, family, QR, Telegram bot, USSD | 4–6 customizable quick actions, family/payment reminders, recurring/autopay mental model | Superapp overload |

## 4. Cross-product comparison matrix

| Dimension | Benchmarks show | Current Mini App | Opportunity |
|---|---|---|---|
| **Navigation** | Mobile finance apps prioritize 3–5 core tabs + quick action; advanced sections go behind “More”. | Good: Home / History / Budgets / More + centered add. Debts/Analytics live in More. | Keep this IA. Make More expandable later: Debts, Analytics, Recurring, Settings, Export. |
| **Quick add** | Money Manager wins with speed; Copilot/Rocket rely on bank sync; Telegram can win through voice/text. | Good centered `+`; QuickAdd is amount-first with recent categories. | Add templates/bookmarks, recent merchant rules, “same as last time”, voice/text parse as primary Telegram advantage. |
| **Categories / merchants** | All strong apps rely on category correctness. Copilot/Rocket add rules/automation. | Has category filters and recent categories; merchant suggestions exist in QuickAdd. | Add categorization rules and “uncategorized/needs review” queue. |
| **Budget model** | Wallet = limits/alerts; YNAB = assignment/targets; Copilot = rollovers. | Budgets exist and are login-gated; current copy promises limits/alerts. | Make budgets actionable: spent, remaining, reset period, warning threshold, rollover optional later. |
| **Debts/shared expenses** | Splitwise is person/group-first, not transaction-first. | Debts page has direction summary and filters. | Reframe debt around person/group, due date/reminder, payment history, settle/close. Telegram chat groups are a natural differentiator. |
| **Analytics** | Best products answer human questions, not just show charts: where money went, what changed, upcoming charges. | Analytics has health, spending chart, monthly trends. | Add “what changed vs last week/month”, merchant/category drivers, recurring payments, actionable insights. |
| **Recurring/subscriptions** | Rocket Money owns this; Wallet has planned payments; Splitwise has recurring shared expenses. | Not clearly surfaced as a first-class concept. | Add recurring detector/rules: “похоже на регулярный платёж”, reminders before charge, subscriptions list. |
| **Retention** | YNAB uses method/education; Rocket/Copilot use alerts/insights; Splitwise uses social settlement. | Weekly review workflow exists as user need, not fully visible in UI. | Make weekly review a product loop: digest, decisions, “needs attention”, Obsidian export later if requested. |
| **Premium** | Premium usually unlocks automation, advanced analytics, receipt scan, import/export, sharing, historical depth. | Has usage limits/Premium UI. | Premium should sell real value: smart categorization, recurring detection, receipt scan/itemization, export, advanced review, rules, more history/groups. |
| **Local context** | UZ apps are card/payment-first: Uzcard/Humo, transfer by phone/card, utilities, family, QR, cashback. | App is tracking-first, not payment-first. | Use local semantics in labels and classification, without trying to become Payme/Click. |

## 5. Product thesis and MVP stance

Recommended thesis:

> A Telegram-first finance assistant that turns messy daily messages into clean weekly understanding: real expenses, own transfers, savings, debts, reimbursements and group payments are separated automatically enough that reviews become trustworthy.

MVP should compete on **capture + classification + review**, not on being a bank, superapp, or full accounting system.

### MVP core loop

1. User records transaction in Telegram/Mini App in under 10 seconds.
2. App classifies it: expense, income, own transfer, saving/deposit, debt, reimbursement, cash withdrawal, group payment.
3. If uncertain, app asks/queues it for review.
4. User sees current month cashflow + top spending + budget status.
5. Weekly digest explains: where money went, what is not a real expense, what needs attention.
6. Budget/debt/recurring reminders pull user back only when useful.

## 6. Roadmap ideas

### P0 — correctness and semantics before more charts

1. **Transaction semantic type:** expense / income / own transfer / saving-deposit / debt / reimbursement / cash withdrawal / group payment.
2. **Own transfer handling:** never count card-to-card, deposit top-ups or wallet movements as spending.
3. **Debt redesign:** person-first debts, payment history, due/reminder, settle/close.
4. **Budget basics:** recurring limits with reset; spent/remaining; warning threshold; category tie-in.
5. **Weekly review foundation:** summary that separates real expenses from transfers/debts/savings/reimbursements.

### P1 — daily speed and attention system

1. Templates/bookmarks for frequent operations, inspired by Money Manager.
2. Rules for merchants/categories, inspired by Copilot/Rocket Money.
3. “Needs attention” cards on Home:
   - suspicious recurring payment
   - category near/over budget
   - uncategorized transaction
   - unpaid debt
   - unusual spend vs previous period
4. Calendar/month view for review.
5. Recurring payments list with reminders.

### P2 — premium/future differentiation

1. Receipt scan/itemization.
2. Advanced analytics: period comparison, merchant drivers, trend explanations.
3. Custom category/rule engine.
4. Export/report pack.
5. Telegram group shared expenses.
6. Multicurrency/account/card model after semantic correctness is stable.

## 7. What not to copy blindly

- **Wallet/Copilot full complexity**: accounts, investments, net worth, property, bank sync and web dashboards can bury the Telegram use case.
- **Money Manager density**: tables and explicit accounting are powerful but too heavy for a Mini App first impression.
- **YNAB full method**: useful philosophy, but steep learning curve is a known risk.
- **Rocket Money concierge**: bill negotiation and subscription cancellation are operational businesses, not a solo MVP.
- **Splitwise split-mode overload**: start with equal/amount split; add percentage/shares later.
- **Revolut/TBC/Payme/Click payment-first flows**: learn from their UI and local semantics, but do not become a payment superapp.
- **Beautiful dashboards before correctness**: wrong classification makes analytics misleading.

## 8. Suggested next deliverable

Turn this research into a product plan:

1. Define target user scenarios.
2. Pick the first narrow differentiator: **weekly trustworthy review**.
3. Audit current data model/API/UI against semantic transaction types.
4. Write P0 implementation slices:
   - semantic transaction classification
   - transfer/debt/saving exclusion from expenses
   - debt person-first UX
   - budget reset/remaining/warning UX
   - weekly review screen/message
5. Only after P0 semantics: improve visual analytics and premium packaging.
