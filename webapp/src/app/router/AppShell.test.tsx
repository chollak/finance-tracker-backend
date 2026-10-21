import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useTelegramBackButton } from '@/shared/lib/navigation';
import { AppShell } from './AppShell';

/**
 * FT-110 review: the app shell is where Telegram's BackButton is kept in step with the screen. Without it
 * nested screens inside Telegram have no back at all (their headers leave «Назад» to Telegram), so the
 * mount is checked here; what the hook's effect does is covered by `keepTelegramBackButtonInStep`.
 */
vi.mock('@/shared/lib/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/navigation')>();
  return { ...actual, useTelegramBackButton: vi.fn(actual.useTelegramBackButton) };
});

function renderShell(path: string): string {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '*', element: <p>Экран</p> }] }],
    { initialEntries: [path] }
  );
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  it('keeps Telegram’s BackButton in step with the screen it frames', () => {
    vi.mocked(useTelegramBackButton).mockClear();

    expect(renderShell('/transactions')).toContain('Экран');
    expect(useTelegramBackButton).toHaveBeenCalled();
  });

  it('keeps the bottom system zone clear below every screen', () => {
    expect(renderShell('/transactions')).toMatch(/<main[^>]*class="[^"]*pb-\[env\(safe-area-inset-bottom\)\]/);
  });
});
