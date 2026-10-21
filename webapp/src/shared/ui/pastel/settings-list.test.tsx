import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsSection } from './settings-list';

/**
 * SettingsList.md, board «„Ещё“ — разделы и настройки» (FT-125 review): a section's heading is 13px bold with the
 * board's own line height (`normal`) and no tightening. The app's headings are set to 1.12 and -0.025em; on the
 * heading of each section that took about 3px off, and by «Данные» the cards stood 14px higher than on the board.
 */

describe('SettingsSection', () => {
  it('has the board\'s line height and letter spacing on its heading', () => {
    const html = renderToStaticMarkup(
      <SettingsSection title="Деньги">
        <div />
      </SettingsSection>
    );
    const heading = html.match(/<h2 class="([^"]+)">Деньги<\/h2>/)?.[1].split(' ') ?? [];

    expect(heading).toEqual(expect.arrayContaining(['text-[13px]', 'font-bold', 'leading-[normal]', 'tracking-normal']));
  });
});
