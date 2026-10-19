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

  it('leaves guests (records only on this device) alone: they have no server accounts', () => {
    expect(firstLaunchDecision({ userType: 'guest', settings: { isPending: true, isError: false, data: undefined } })).toBe('app');
  });
});
