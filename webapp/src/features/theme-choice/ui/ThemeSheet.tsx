import { useThemeStore } from '@/shared/lib/theme';
import { OptionPicker } from '@/shared/ui/pastel';
import { themeOptions } from '../model/themeChoice';
import { useThemeChoice } from '../api/useThemeChoice';

interface ThemeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Inside Telegram the automatic theme is «Как в Telegram», by a direct link «Как в системе». */
  inTelegram: boolean;
}

/**
 * «Тема» (FT-125, board «Тема»; Picker.md): «Как в Telegram» with what Telegram has now, «Светлая», «Тёмная». A choice
 * applies at once and the sheet stays open, so the new theme is right there to look at; «Закрыть» closes it. What
 * Telegram has now follows Telegram while the sheet is open (`themeChanged`, through ThemeController).
 */
export function ThemeSheet({ open, onOpenChange, inTelegram }: ThemeSheetProps) {
  const { preference, choose } = useThemeChoice();
  const automatic = useThemeStore((state) => state.automatic);
  const options = themeOptions(inTelegram, automatic);

  return (
    <OptionPicker
      open={open}
      onOpenChange={onOpenChange}
      title="Тема"
      options={options.map((option) => ({ id: option.value, name: option.title, detail: option.subtitle }))}
      selectedId={preference}
      onSelect={(picked) => {
        const option = options.find((item) => item.value === picked.id);
        if (option) choose(option.value);
      }}
      keepOpen
      padded
    />
  );
}
