/**
 * Text as it is searched (FT-107): lower case by Russian rules, «ё» as «е», single spaces. SQLite's
 * LIKE and lower() fold only Latin letters, so search columns are normalized in code — «Такси» is
 * found by «такси».
 */
export function searchKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
