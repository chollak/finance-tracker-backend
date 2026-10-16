import { describe, expect, it } from 'vitest';
import { formatMinor, groupDigits, MINUS, NBSP } from './formatMoney';

describe('formatMinor', () => {
  it('formats сумы without fractions, with a real minus and a non-breaking space', () => {
    expect(formatMinor(-18_640_000, 'UZS')).toBe(`${MINUS}186${NBSP}400${NBSP}сум`);
    expect(formatMinor(1_250_000_000, 'UZS', { sign: 'always' })).toBe(`+12${NBSP}500${NBSP}000${NBSP}сум`);
  });

  it('formats dollars with cents after a comma', () => {
    expect(formatMinor(42_000, 'USD')).toBe(`420,00${NBSP}USD`);
    expect(formatMinor(-1146, 'USD', { sign: 'always' })).toBe(`${MINUS}11,46${NBSP}USD`);
  });

  it('can drop the sign and the unit', () => {
    expect(formatMinor(-2_500_000, 'UZS', { sign: 'none', unit: false })).toBe(`25${NBSP}000`);
    expect(formatMinor(0, 'UZS', { sign: 'always' })).toBe(`0${NBSP}сум`);
  });

  it('groups digits by three', () => {
    expect(groupDigits('9743000')).toBe(`9${NBSP}743${NBSP}000`);
    expect(groupDigits('12')).toBe('12');
  });
});
