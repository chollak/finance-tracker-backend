/**
 * The audit of the user (FT-132): the current audit and the goals counting today. `all(userId)` is among what every
 * change of records refetches — a record of the month audited may still change an audit nobody has marked yet, and the
 * goals count what is spent.
 */
export const auditKeys = {
  all: (userId: string) => ['audit', userId] as const,
  current: (userId: string) => [...auditKeys.all(userId), 'current'] as const,
  goals: (userId: string) => [...auditKeys.all(userId), 'goals'] as const,
};
