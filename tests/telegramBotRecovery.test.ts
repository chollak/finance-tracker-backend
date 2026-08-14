import { launchWithRecovery } from '../src/delivery/messaging/telegram/launchWithRecovery';

/**
 * A single conflicting getUpdates used to disable the bot for the lifetime of
 * the process: launch rejected, the failure was logged as a warning, and the
 * API kept answering 200 so nothing looked wrong from outside.
 */
describe('launchWithRecovery', () => {
  const noWait = () => Promise.resolve();
  // Grace resolves immediately; an already-rejected launch still reports first,
  // because its rejection handler is queued before this continuation.
  const noGrace = () => Promise.resolve();

  it('reports a bot that starts on the first try', async () => {
    const launch = jest.fn().mockImplementation(() => new Promise(() => {})); // polling keeps running
    const onRunning = jest.fn();

    await launchWithRecovery({ launch, onRunning, wait: noWait, grace: noGrace }).settled;

    expect(launch).toHaveBeenCalledTimes(1);
    expect(onRunning).toHaveBeenCalledTimes(1);
  });

  it('retries after a conflict instead of giving up', async () => {
    const launch = jest.fn()
      .mockRejectedValueOnce(new Error('409: Conflict: terminated by other getUpdates request'))
      .mockImplementationOnce(() => new Promise(() => {}));

    const state = launchWithRecovery({ launch, wait: noWait, grace: noGrace, maxAttempts: 3 });
    await state.settled;

    expect(launch).toHaveBeenCalledTimes(2);
    expect(state.recovered).toBe(true);
  });

  it('waits longer after each failure', async () => {
    const waits: number[] = [];
    const launch = jest.fn().mockRejectedValue(new Error('409: Conflict'));

    await launchWithRecovery({
      launch,
      wait: (ms) => { waits.push(ms); return Promise.resolve(); },
      grace: noGrace,
      maxAttempts: 3,
    }).settled;

    expect(waits).toHaveLength(3);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits[2]).toBeGreaterThan(waits[1]);
  });

  it('gives up loudly rather than quietly after exhausting attempts', async () => {
    const launch = jest.fn().mockRejectedValue(new Error('409: Conflict'));
    const onExhausted = jest.fn();

    const state = launchWithRecovery({ launch, wait: noWait, grace: noGrace, maxAttempts: 2, onExhausted });
    await state.settled;

    expect(launch).toHaveBeenCalledTimes(2);
    expect(state.recovered).toBe(false);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it('exposes whether the bot is currently running', async () => {
    const launch = jest.fn().mockImplementation(() => new Promise(() => {}));
    const state = launchWithRecovery({ launch, wait: noWait, grace: noGrace });
    await state.settled;

    expect(state.isRunning()).toBe(true);
  });
});
