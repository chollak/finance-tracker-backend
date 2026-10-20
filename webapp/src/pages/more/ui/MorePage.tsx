import { useState, type ReactNode } from 'react';
import { Bell, CalendarDays, Download, Flag, Moon, Search, Tag, User, Wallet } from 'lucide-react';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useUsdRate } from '@/entities/rate';
import { useSettings, useUpdateSettings } from '@/entities/settings';
import { useIsGuest, useUserStore } from '@/entities/user';
import { useExportRecords } from '@/features/export-records';
import { ThemeSheet, themeLabel, useThemeChoice } from '@/features/theme-choice';
import { ROUTES } from '@/shared/lib/constants/routes';
import { insideTelegram } from '@/shared/lib/telegram';
import { showUndoToast } from '@/shared/lib/undo';
import { BackButton, SettingsRow, SettingsSection, UndoToast } from '@/shared/ui/pastel';
import {
  accountsState,
  accountState,
  AUDIT_SOON,
  BOT_NOTE,
  categoriesState,
  DATA_NOTE,
  GUEST_NOTIFICATION_STATE,
  NOTIFICATION_KINDS,
  NOTIFICATION_SAVE_FAILED,
  NOTIFICATIONS,
  notificationPatch,
  notificationState,
  VERSION_LINE,
  type NotificationKind,
} from '../model/moreScreen';
import { NotificationSheet } from './NotificationSheet';

const icon = (Icon: typeof Bell) => <Icon strokeWidth={1.8} />;

const NOTIFICATION_ICONS: Record<NotificationKind, ReactNode> = {
  summary: icon(Bell),
  audit: icon(CalendarDays),
  goals: icon(Flag),
};

/**
 * «Ещё» (FT-125, boards «„Ещё“ — разделы и настройки», «Сводка дня в боте», «Тема», «„Ещё“ в браузере», «„Ещё“ ·
 * тёмная»): sections, not a settings screen with «Сохранить». «Деньги» — the accounts and the rate, the categories,
 * the audit; «Бот в Telegram» — the summary, the audit call and goal alerts, which drive the bot's scheduler (FT-124);
 * «Вид» — the theme; «Данные» — the export; by a direct link also «Аккаунт». Every row says its state, every change
 * applies at once. Budgets and debts are not here (Д2). «Скачать все записи» (FT-126) sends the CSV to the chat with the
 * bot in Telegram and downloads it in a browser. «Категории» opens the categories screen (FT-127). The audit (FT-132)
 * comes later: its row says so and opens nothing yet.
 */
export function MorePage() {
  const inTelegram = insideTelegram();
  const isGuest = useIsGuest();
  const userName = useUserStore((state) => state.userName);
  const accounts = useAccounts();
  const rates = useUsdRate();
  const categories = useCategories();
  const settings = useSettings();
  const { preference } = useThemeChoice();
  const exportRecords = useExportRecords(inTelegram);
  const { mutate } = useUpdateSettings({ onError: () => showUndoToast({ kind: 'info', ...NOTIFICATION_SAVE_FAILED }) });
  const [sheet, setSheet] = useState<NotificationKind | 'theme' | null>(null);

  const notice = sheet === 'theme' ? null : sheet;
  const account = accountState({ isGuest, name: userName });

  const notificationRow = (kind: NotificationKind) => {
    const title = NOTIFICATIONS[kind].title;
    const rowIcon = NOTIFICATION_ICONS[kind];
    if (isGuest) return <SettingsRow key={kind} kind="static" icon={rowIcon} title={title} subtitle={GUEST_NOTIFICATION_STATE} />;
    if (settings.data) {
      const { state } = notificationState(kind, settings.data);
      return <SettingsRow key={kind} kind="sheet" onClick={() => setSheet(kind)} icon={rowIcon} title={title} subtitle={state} />;
    }
    if (settings.isError) {
      return (
        <SettingsRow
          key={kind}
          kind="action"
          onClick={() => void settings.refetch()}
          disabled={settings.isFetching}
          icon={rowIcon}
          title={title}
          subtitle="Не загрузилось. Нажмите, чтобы повторить"
        />
      );
    }
    return <SettingsRow key={kind} kind="action" onClick={() => {}} disabled icon={rowIcon} title={title} />;
  };

  return (
    <div className="mx-auto w-full max-w-3xl text-ink">
      {/* The header stays and the list scrolls under it, as on the board and on History */}
      <div className="sticky top-0 z-10 bg-bg px-4 py-2">
        <header className="flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section text-ink">Ещё</h1>
        </header>
      </div>

      <div className="px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-1">
        <div className="flex flex-col gap-5">
          <SettingsSection title="Деньги">
            <SettingsRow
              kind="link"
              to={ROUTES.ACCOUNTS}
              icon={icon(Wallet)}
              title="Счета и курс доллара"
              subtitle={isGuest ? GUEST_NOTIFICATION_STATE : accountsState(accounts.data, rates.data)}
            />
            <SettingsRow
              kind="link"
              to={ROUTES.CATEGORIES}
              icon={icon(Tag)}
              title="Категории"
              subtitle={isGuest ? GUEST_NOTIFICATION_STATE : categoriesState(categories.data)}
            />
            <SettingsRow kind="static" icon={icon(Search)} title="Ревизия трат" subtitle={AUDIT_SOON} />
          </SettingsSection>

          <SettingsSection title="Бот в Telegram" note={BOT_NOTE}>
            {NOTIFICATION_KINDS.map(notificationRow)}
          </SettingsSection>

          <SettingsSection title="Вид">
            <SettingsRow kind="sheet" onClick={() => setSheet('theme')} icon={icon(Moon)} title="Тема" subtitle={themeLabel(preference, inTelegram)} />
          </SettingsSection>

          <SettingsSection title="Данные" note={DATA_NOTE}>
            {/* A guest's records are in this browser only: the export is for an account (FT-126) */}
            {isGuest ? (
              <SettingsRow kind="static" icon={icon(Download)} title="Скачать все записи" subtitle={GUEST_NOTIFICATION_STATE} />
            ) : (
              <SettingsRow
                kind="action"
                onClick={exportRecords.start}
                busy={exportRecords.phase === 'pending'}
                inactive={exportRecords.phase === 'done'}
                icon={icon(Download)}
                title="Скачать все записи"
                subtitle={exportRecords.subtitle}
              />
            )}
          </SettingsSection>

          {!inTelegram && (
            <SettingsSection title="Аккаунт">
              <SettingsRow kind="static" icon={icon(User)} title={account.title} subtitle={account.subtitle} />
            </SettingsSection>
          )}

          <p className="text-center text-[13px] font-semibold text-ink-muted">{VERSION_LINE}</p>
        </div>
      </div>

      {notice && settings.data && (
        <NotificationSheet
          kind={notice}
          onClose={() => setSheet(null)}
          settings={settings.data}
          onChange={(change) => mutate(notificationPatch(notice, change))}
        />
      )}
      <ThemeSheet open={sheet === 'theme'} onOpenChange={(open) => setSheet(open ? 'theme' : null)} inTelegram={inTelegram} />

      {/* «Не получилось сохранить настройку» — after the sheet closes (Toast.md); «Файл отправлен в чат с ботом» 24px over
          the edge, as on the board «Выгрузка записей» */}
      <UndoToast bottom={24} />
    </div>
  );
}
