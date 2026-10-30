import { captureDayOf, capturedAtProblem, inputDayOf, parseCapturedAt } from '../src/modules/quickCapture/domain/capturedAt';

/** FT-175: the time a phrase was typed on the phone, as the client sends it, and what the server accepts. */
describe('capturedAt', () => {
  describe('format', () => {
    it.each([
      ['2026-10-27T09:15:00+05:00', '2026-10-27T04:15:00.000Z'],
      ['2026-10-27T04:15:00Z', '2026-10-27T04:15:00.000Z'],
      ['2026-10-27T04:15:00.123Z', '2026-10-27T04:15:00.123Z'],
      ['2026-10-26T23:15:00-05:00', '2026-10-27T04:15:00.000Z'],
    ])('reads %s', (value, moment) => {
      expect(parseCapturedAt(value)?.toISOString()).toBe(moment);
    });

    it.each([
      ['no time zone: a local time means nothing on the server', '2026-10-27T09:15:00'],
      ['a date only', '2026-10-27'],
      ['no seconds', '2026-10-27T09:15+05:00'],
      ['a zone without a colon', '2026-10-27T09:15:00+0500'],
      ['a day that does not exist', '2026-02-30T09:15:00Z'],
      ['an hour that does not exist', '2026-10-27T24:00:00Z'],
      ['a space instead of T', '2026-10-27 09:15:00Z'],
      ['words', 'yesterday'],
      ['a number', 1761542100000],
      ['an empty string', ''],
    ])('refuses %s', (_why, value) => {
      expect(parseCapturedAt(value)).toBeNull();
    });
  });

  describe('limits by the server clock', () => {
    const now = new Date('2026-10-29T12:00:00.000Z');
    const at = (iso: string) => new Date(iso);

    it('takes up to 5 minutes ahead quietly: the phone\'s and the server\'s clocks drift apart a little', () => {
      expect(capturedAtProblem(at('2026-10-29T12:05:00.000Z'), now)).toBeNull();
      expect(capturedAtProblem(at('2026-10-29T12:05:00.001Z'), now)).toBe('ahead');
    });

    it('calls more than 24 hours ahead far ahead: the PC\'s clock does not lag by a day', () => {
      expect(capturedAtProblem(at('2026-10-30T12:00:00.000Z'), now)).toBe('ahead');
      expect(capturedAtProblem(at('2026-10-30T12:00:00.001Z'), now)).toBe('far_ahead');
    });

    it('accepts up to 30 days old: longer than the queue waits while the PC is off', () => {
      expect(capturedAtProblem(at('2026-09-29T12:00:00.000Z'), now)).toBeNull();
      expect(capturedAtProblem(at('2026-09-29T11:59:59.999Z'), now)).toBe('too_old');
    });
  });

  describe('the day of input', () => {
    it('is the day on the user\'s calendar, whatever zone the phone wrote it in', () => {
      // 01:30 on the 29th in Tashkent, written in UTC as many clients do
      expect(inputDayOf(new Date('2026-10-28T20:30:00Z'))).toBe('2026-10-29');
      expect(inputDayOf(parseCapturedAt('2026-10-29T01:30:00+05:00')!)).toBe('2026-10-29');
      // 23:30 on the 28th in Istanbul is already the 29th in Tashkent
      expect(inputDayOf(parseCapturedAt('2026-10-28T23:30:00+03:00')!)).toBe('2026-10-29');
    });
  });

  describe('the day a phone\'s capture is dated by', () => {
    // The server's clock: Thursday 2026-10-29, 17:00 in Tashkent
    const now = new Date('2026-10-29T12:00:00.000Z');

    it('is the day of input when the time is behind the server or a little ahead of it', () => {
      expect(captureDayOf(new Date('2026-10-27T09:15:00+05:00'), now)).toBe('2026-10-27');
      expect(captureDayOf(new Date('2026-10-29T23:58:00+05:00'), now)).toBe('2026-10-29');
    });

    it('is the day of input up to 24 hours ahead: the PC\'s clock in WSL lags after a sleep', () => {
      // 08:00 on Friday by the phone is 15 hours ahead of the server
      expect(captureDayOf(new Date('2026-10-30T08:00:00+05:00'), now)).toBe('2026-10-30');
      expect(captureDayOf(new Date('2026-10-30T12:00:00.000Z'), now)).toBe('2026-10-30');
    });

    it('is the server\'s day more than 24 hours ahead: then the phone\'s clock is the wrong one', () => {
      expect(captureDayOf(new Date('2026-10-30T12:00:00.001Z'), now)).toBe('2026-10-29');
      expect(captureDayOf(new Date('2026-11-05T09:00:00+05:00'), now)).toBe('2026-10-29');
    });
  });
});
