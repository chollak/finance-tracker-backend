import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { appRoutes } from './appRoutes';

/**
 * #207: the voice check of the FT-088 spike is gone — the spike was dropped on 2026-10-31, voice is in the iOS app and
 * the bot. Its address is an unknown one now, while the showcase /dev/pastel stays and opens outside the app's gates.
 */

const SHOWCASE = '/dev/pastel';

const matchesAt = (path: string) => matchRoutes(appRoutes, path) ?? [];
const screenAt = (path: string) => matchesAt(path).at(-1)?.route.path;

describe('/dev pages', () => {
  it('the showcase is its own screen, outside the login and the first launch', () => {
    expect(screenAt(SHOWCASE)).toBe(SHOWCASE);
    expect(matchesAt(SHOWCASE)).toHaveLength(1);
  });

  it('the voice check is gone: its address is an unknown one', () => {
    expect(screenAt('/dev/voice-check')).toBe('*');
  });
});
