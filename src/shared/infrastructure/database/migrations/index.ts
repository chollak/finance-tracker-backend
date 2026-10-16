import { Baseline1760600000000 } from './1760600000000-Baseline';
import { AmountMinor1760700000000 } from './1760700000000-AmountMinor';

/**
 * Every schema change is a migration listed here, in order. Classes are listed explicitly instead of
 * a glob so the same list works from `src` (ts-jest, ts-node-dev) and from compiled `dist`.
 */
export const MIGRATIONS = [Baseline1760600000000, AmountMinor1760700000000];
