import { describe, expect, it, vi } from 'vitest';
import { reloadHere, reloadHome } from './reload';

/**
 * #240: both ways out of «Экран не открылся» load the app again from the server rather than move inside it — the code
 * that did not load comes anew, and a screen that fell starts from scratch.
 */

function fakeLocation() {
  return { reload: vi.fn(), replace: vi.fn() };
}

describe('the ways out of a screen that did not open', () => {
  it('«Обновить» loads the same address again', () => {
    const location = fakeLocation();

    reloadHere(location);

    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('«На главную» loads Home in this address’s place, so «Назад» does not lead back to it', () => {
    const location = fakeLocation();

    reloadHome(location);

    expect(location.replace).toHaveBeenCalledWith('/');
    expect(location.reload).not.toHaveBeenCalled();
  });
});
