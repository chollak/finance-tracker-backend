export const formatAmount = (value: number): string =>
  new Intl.NumberFormat('ru-RU').format(value);
