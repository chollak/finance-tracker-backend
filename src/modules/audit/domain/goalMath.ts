/** The numbers of the audit's goals (FT-131, design-system «Ревизия трат»): «Лимиты округляются до тысячи». */
export const GOAL_RULES = {
  /** Limits are rounded to a thousand сум (minor units), half up. */
  roundingMinor: 100_000,
} as const;

export function roundToThousand(minor: number): number {
  return Math.round(minor / GOAL_RULES.roundingMinor) * GOAL_RULES.roundingMinor;
}

/** «Вдвое меньше»: half of the spending's month, to a thousand сум — 349 000 сум a month gives a limit of 175 000. */
export function halfLimitMinor(monthlyMinor: number): number {
  return roundToThousand(monthlyMinor / 2);
}
