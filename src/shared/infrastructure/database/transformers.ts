import { ValueTransformer } from 'typeorm';

/**
 * `bigint` columns hold integer minor units (FT-097). SQLite returns them as numbers, Postgres as
 * strings; either way the domain gets a number. Minor units stay far below 2^53, so this is exact.
 */
export const bigintNumber: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
};
