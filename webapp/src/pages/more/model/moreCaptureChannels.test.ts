import { describe, expect, it } from 'vitest';
import {
  getMoreCaptureChannels,
  MANUAL_CAPTURE_HREF,
  type CaptureChannelId,
  type MoreCaptureChannel,
} from './moreCaptureChannels';

const channels = (overrides: Partial<Parameters<typeof getMoreCaptureChannels>[0]> = {}) =>
  getMoreCaptureChannels({ isGuest: false, hasBotLink: true, ...overrides });

const byId = (id: CaptureChannelId, overrides = {}): MoreCaptureChannel =>
  channels(overrides).find((channel) => channel.id === id)!;

describe('getMoreCaptureChannels', () => {
  it('lists every channel the product has, built or not', () => {
    expect(channels().map((channel) => channel.id)).toEqual([
      'text',
      'voice',
      'shortcut',
      'manual',
      'scan',
    ]);
  });

  it('never offers an action for a channel it just said is unavailable', () => {
    for (const input of [
      { isGuest: false, hasBotLink: true },
      { isGuest: true, hasBotLink: true },
      { isGuest: false, hasBotLink: false },
      { isGuest: true, hasBotLink: false },
    ]) {
      const unavailable = getMoreCaptureChannels(input).filter((c) => !c.isAvailable);

      expect(unavailable.length).toBeGreaterThan(0);
      for (const channel of unavailable) {
        expect(channel.action).toBe('none');
      }
    }
  });

  it('sends text capture to the field that performs it', () => {
    const text = byId('text');

    expect(text.isAvailable).toBe(true);
    expect(text.action).toBe('capture');
    expect(text.status).toBe('Здесь');
  });

  it('closes text capture for a guest, because it writes to the server', () => {
    const text = byId('text', { isGuest: true });

    expect(text.isAvailable).toBe(false);
    expect(text.action).toBe('none');
    expect(text.status).toBe('Нужен вход');
    expect(text.description).toContain('Telegram');
  });

  it('offers the bot chat for voice when a bot link was built in', () => {
    expect(byId('voice').action).toBe('telegram');
  });

  it('drops to explanation when no bot username is available to link to', () => {
    const voice = byId('voice', { hasBotLink: false });

    // Still a real channel — it works in Telegram whether or not this build can deep-link to it.
    expect(voice.isAvailable).toBe(true);
    expect(voice.action).toBe('none');
  });

  it('keeps voice honest about the Mini App having no recorder', () => {
    expect(byId('voice').description).toContain('микрофона нет');
  });

  it('leaves the iPhone shortcut as an explanation — nothing here can set one up', () => {
    const shortcut = byId('shortcut');

    expect(shortcut.isAvailable).toBe(true);
    expect(shortcut.action).toBe('none');
  });

  it('routes the manual fallback to the manual entry screen', () => {
    const manual = byId('manual');

    expect(manual.action).toBe('route');
    expect(manual.href).toBe(MANUAL_CAPTURE_HREF);
  });

  it('never claims a receipt scanner exists, in any state', () => {
    for (const isGuest of [false, true]) {
      const scan = byId('scan', { isGuest });

      expect(scan.isAvailable).toBe(false);
      expect(scan.action).toBe('none');
      expect(scan.status).toBe('Скоро');
    }
  });

  it('gives a route only to the channel that has one', () => {
    const withHref = channels().filter((channel) => channel.href !== undefined);

    expect(withHref.map((channel) => channel.id)).toEqual(['manual']);
  });
});
