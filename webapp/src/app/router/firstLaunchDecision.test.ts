import { describe, expect, it } from 'vitest';
import { firstLaunchDecision } from './firstLaunchDecision';

describe('first launch gate (FT-109)', () => {
  const settled = { isPending: false, isError: false };

  it('waits until the user is known', () => {
    expect(firstLaunchDecision({ userType: null, settings: { ...settled, data: undefined } })).toBe('wait');
  });

  it('waits for the settings of a signed-in user', () => {
    expect(firstLaunchDecision({ userType: 'telegram', settings: { isPending: true, isError: false, data: undefined } })).toBe('wait');
  });

  it('shows the first launch while onboardedAt is empty — new and migrated users alike', () => {
    expect(firstLaunchDecision({ userType: 'telegram', settings: { ...settled, data: { onboardedAt: null } } })).toBe('first-launch');
  });

  it('opens the app once the first launch is done', () => {
    expect(
      firstLaunchDecision({ userType: 'telegram', settings: { ...settled, data: { onboardedAt: '2026-10-19T09:00:00.000Z' } } })
    ).toBe('app');
  });

  it('opens the app when the settings cannot be read, rather than locking the user out', () => {
    expect(firstLaunchDecision({ userType: 'telegram', settings: { isPending: false, isError: true, data: undefined } })).toBe('app');
  });

  // FT-125 review: «Ещё» and Home read the settings themselves; on mount a failed read is pending again
  it('once the app is open, a read of the settings asked again does not take it away', () => {
    const askedAgain = { isPending: true, isError: false, data: undefined };

    expect(firstLaunchDecision({ userType: 'telegram', settings: askedAgain, opened: true })).toBe('app');
    // Before the app has opened, the gate still waits
    expect(firstLaunchDecision({ userType: 'telegram', settings: askedAgain, opened: false })).toBe('wait');
  });

  it('once open, the settings read at last still show the first launch to a user who has not done it', () => {
    expect(firstLaunchDecision({ userType: 'telegram', settings: { ...settled, data: { onboardedAt: null } }, opened: true })).toBe('first-launch');
  });

  it('leaves guests (records only on this device) alone: they have no server accounts', () => {
    expect(firstLaunchDecision({ userType: 'guest', settings: { isPending: true, isError: false, data: undefined } })).toBe('app');
  });
});
