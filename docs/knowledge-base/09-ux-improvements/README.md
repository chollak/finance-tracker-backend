# UX Improvements Documentation

This section tracks UI/UX improvements for the Finance Tracker webapp.

## Contents

- [UI/UX Analysis](./ui-ux-analysis.md) - Complete analysis and recommendations

## Status

- **Focus:** UX Efficiency
- **Phase:** Implementation Planning

## Quick Reference

### Priority Items

1. Quick Add Mode - numpad-first transaction entry
2. Inline Quick Actions - [+Income] [-Expense] on Dashboard
3. Budget Velocity Predictions - "Хватит до: 25 янв"
4. Swipe-to-Archive - gesture-based archival
5. Smart Category Suggestion - ML-based prediction

### Key Files to Modify

```
webapp/src/
├── pages/home/index.tsx
├── features/add-transaction/
├── entities/transaction/ui/
├── entities/budget/ui/
└── widgets/balance-card/
```
