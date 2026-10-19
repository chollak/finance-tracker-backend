import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes, MemoryRouter } from 'react-router-dom';
import { AccountsPage } from '@/pages';
import { ROUTES } from '@/shared/lib/constants/routes';
import { appRoutes } from './appRoutes';

/**
 * FT-111 review: «Все счета и курс доллара» on the balance card links to the accounts screen, which FT-118
 * builds. Until then the address must open an honest placeholder, not «Страница не найдена».
 */

/** The route that renders an address: the deepest match of the app's route table. */
function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('/accounts', () => {
  it('is a screen of the app, not the catch-all of unknown addresses', () => {
    expect(screenAt(ROUTES.ACCOUNTS)).toBe(ROUTES.ACCOUNTS);
    // The check itself tells the two apart
    expect(screenAt('/no-such-screen')).toBe('*');
  });

  it('says the accounts and the rate will be here, with «Назад» and one way back to Home', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[ROUTES.ACCOUNTS]}>
        <AccountsPage />
      </MemoryRouter>
    );

    expect(html).toMatch(/<h1[^>]*>Счета и курс доллара<\/h1>/);
    expect(text(html)).toContain('Счета и курс появятся здесь.');
    expect(html).toMatch(/<button[^>]*>На главную<\/button>/);
    // Outside Telegram a nested screen draws its own «Назад»
    expect(html).toMatch(/<button[^>]*aria-label="Назад"/);
    expect(text(html)).not.toContain('Страница не найдена');
  });
});
