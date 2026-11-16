import { RecentMediaGroups } from '../src/delivery/messaging/telegram/utils/recentMediaGroups';

/**
 * #279: an album — several photos or videos with one `media_group_id` — comes as one message per item. The bot answers
 * its first one only; the memory of albums lives in the bot's process, small and short, and nothing goes to the base.
 */
describe('recent albums (#279)', () => {
  let now: number;
  const albums = (options: { ttlMs?: number; maxSize?: number } = {}) =>
    new RecentMediaGroups({ ttlMs: 120_000, maxSize: 100, ...options, now: () => now });

  beforeEach(() => {
    now = 1_000_000;
  });

  it('the first message of an album is the first, the rest of it are not', () => {
    const recent = albums();

    expect(recent.isFirst('111:a')).toBe(true);
    expect(recent.isFirst('111:a')).toBe(false);
    expect(recent.isFirst('111:a')).toBe(false);
  });

  it('two albums are two firsts', () => {
    const recent = albums();

    expect(recent.isFirst('111:a')).toBe(true);
    expect(recent.isFirst('111:b')).toBe(true);
  });

  it('an album is forgotten once its time is over', () => {
    const recent = albums({ ttlMs: 120_000 });
    recent.isFirst('111:a');

    now += 119_999;
    expect(recent.isFirst('111:a')).toBe(false);

    now += 1;
    expect(recent.isFirst('111:a')).toBe(true);
  });

  it('keeps no more than its size: the oldest album goes first', () => {
    const recent = albums({ maxSize: 2 });
    recent.isFirst('111:a');
    recent.isFirst('111:b');
    recent.isFirst('111:c');

    expect(recent.size).toBe(2);
    expect(recent.isFirst('111:b')).toBe(false);
    expect(recent.isFirst('111:c')).toBe(false);
    expect(recent.isFirst('111:a')).toBe(true);
  });

  it('forgets the albums whose time is over, so the memory does not grow', () => {
    const recent = albums({ ttlMs: 1000 });
    for (let i = 0; i < 50; i++) {
      recent.isFirst(`111:${i}`);
      now += 100;
    }

    expect(recent.size).toBeLessThanOrEqual(10);
  });
});
