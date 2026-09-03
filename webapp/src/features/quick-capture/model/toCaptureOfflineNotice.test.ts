import { describe, it, expect } from 'vitest';

import { readOnlineStatus, toCaptureOfflineNotice } from './toCaptureOfflineNotice';

describe('toCaptureOfflineNotice', () => {
  it('says nothing while online', () => {
    expect(toCaptureOfflineNotice(true)).toBeNull();
  });

  it('names the missing network when offline', () => {
    expect(toCaptureOfflineNotice(false)?.title).toBe('Нет сети');
  });

  it('promises no offline queue — this feature has none', () => {
    const notice = toCaptureOfflineNotice(false);

    // The card keeps the typed text and nothing else. Any wording about saving, queueing or
    // sending later would describe behaviour that does not exist.
    expect(notice?.description).toContain('Текст останется в поле');
    expect(notice?.description).not.toMatch(/сохранит|отправим позже|очеред/i);
  });
});

describe('readOnlineStatus', () => {
  it('trusts an explicit offline flag', () => {
    expect(readOnlineStatus({ onLine: false })).toBe(false);
  });

  it('reports online when the browser says so', () => {
    expect(readOnlineStatus({ onLine: true })).toBe(true);
  });

  it('stays optimistic when there is no signal, so nothing is blocked on a guess', () => {
    expect(readOnlineStatus(undefined)).toBe(true);
    expect(readOnlineStatus(null)).toBe(true);
    expect(readOnlineStatus({})).toBe(true);
  });
});
