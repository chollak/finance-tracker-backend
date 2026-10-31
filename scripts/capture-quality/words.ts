/**
 * Words next to numbers in the capture quality report (FT-217): the Russian form follows the last digits.
 */

/** A count: «1 запись», «2 записи», «5 записей», «21 запись». Forms: one, few, many. */
export function plural(n: number, forms: [string, string, string]): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (ones === 1) return forms[0];
  if (ones >= 2 && ones <= 4) return forms[1];
  return forms[2];
}

/** After «из N»: «из 1 записи», «из 2 записей», «из 21 записи». Forms: genitive singular, genitive plural. */
export function afterOutOf(n: number, forms: [string, string]): string {
  return n % 10 === 1 && n % 100 !== 11 ? forms[0] : forms[1];
}
