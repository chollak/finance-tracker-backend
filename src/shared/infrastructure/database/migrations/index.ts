import { Baseline1760600000000 } from './1760600000000-Baseline';
import { AmountMinor1760700000000 } from './1760700000000-AmountMinor';
import { UserSettings1760800000000 } from './1760800000000-UserSettings';
import { Categories1760900000000 } from './1760900000000-Categories';

/**
 * Every schema change is a migration listed here, in order. Classes are listed explicitly instead of
 * a glob so the same list works from `src` (ts-jest, ts-node-dev) and from compiled `dist`.
 */
export const MIGRATIONS = [
  Baseline1760600000000,
  AmountMinor1760700000000,
  UserSettings1760800000000,
  Categories1760900000000,
];
