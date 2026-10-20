import { DailySummaryNotifier, DailySummarySender, SummaryRecipient } from '../src/modules/notification/application/dailySummaryNotifier';
import { SummaryService } from '../src/modules/notification/application/summaryService';
import { NotificationLogRepository } from '../src/modules/notification/domain/notificationLog';

/** FT-124: the scheduler looks at the clock when the bot starts and then every minute, one tick at a time. */
describe('daily summary scheduler (FT-124)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function notifier(list: jest.Mock) {
    const log = { find: jest.fn(), claim: jest.fn(), update: jest.fn(), lastSent: jest.fn() } as unknown as NotificationLogRepository;
    return new DailySummaryNotifier(log, { list }, {} as SummaryService, () => new Date('2026-10-14T10:00:00.000Z'));
  }

  const sender: DailySummarySender = { send: jest.fn() };

  it('ticks at start and every minute until stopped', async () => {
    jest.useFakeTimers();
    const list = jest.fn().mockResolvedValue([] as SummaryRecipient[]);
    const scheduler = notifier(list);

    scheduler.start(sender);
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(list).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await jest.advanceTimersByTimeAsync(180_000);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('a slow tick is not overlapped by the next one', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const list = jest.fn().mockReturnValueOnce(new Promise<SummaryRecipient[]>(resolve => { release = () => resolve([]); })).mockResolvedValue([]);
    const scheduler = notifier(list);

    scheduler.start(sender);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(list).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(list).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('a tick that fails does not stop the next ones', async () => {
    jest.useFakeTimers();
    const list = jest.fn().mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue([]);
    const scheduler = notifier(list);

    scheduler.start(sender);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(list).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
