import { Baseline1760600000000 } from './1760600000000-Baseline';
import { AmountMinor1760700000000 } from './1760700000000-AmountMinor';
import { UserSettings1760800000000 } from './1760800000000-UserSettings';
import { Categories1760900000000 } from './1760900000000-Categories';
import { Accounts1761000000000 } from './1761000000000-Accounts';
import { FxRates1761100000000 } from './1761100000000-FxRates';
import { RecordCurrencySource1761200000000 } from './1761200000000-RecordCurrencySource';
import { AccountMoves1761300000000 } from './1761300000000-AccountMoves';
import { TransactionDeletedAt1761400000000 } from './1761400000000-TransactionDeletedAt';
import { TransactionClientId1761500000000 } from './1761500000000-TransactionClientId';
import { TransactionSearchText1761600000000 } from './1761600000000-TransactionSearchText';

/**
 * Every schema change is a migration listed here, in order. Classes are listed explicitly instead of
 * a glob so the same list works from `src` (ts-jest, ts-node-dev) and from compiled `dist`.
 */
export const MIGRATIONS = [
  Baseline1760600000000,
  AmountMinor1760700000000,
  UserSettings1760800000000,
  Categories1760900000000,
  Accounts1761000000000,
  FxRates1761100000000,
  RecordCurrencySource1761200000000,
  AccountMoves1761300000000,
  TransactionDeletedAt1761400000000,
  TransactionClientId1761500000000,
  TransactionSearchText1761600000000,
];
