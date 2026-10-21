import { accountCaption, accountIcon, visibleAccounts, type AccountIcon, type AccountsOverview } from '@/entities/account';
import { dayMonthShort, type LocalDate } from '@/shared/lib/dates';
import { NBSP, formatMinor, usdToUzsMinor } from '@/shared/lib/money';

export interface AccountRow {
  id: string;
  name: string;
  /** «сумы · карта». */
  caption: string;
  icon: AccountIcon;
  /** In the account's currency: «1 250 000 сум», «420,00 USD». */
  balance: string;
  /** A dollar account in сум at the rate the total used: «≈ 5 313 000 сум»; null without a rate. */
  inUzs: string | null;
  /** «Доллары, 420,00 USD, примерно 5 313 000 сум. Открыть счёт». */
  ariaLabel: string;
}

export interface HiddenAccountRow {
  id: string;
  name: string;
  balance: string;
  ariaLabel: string;
}

export interface AccountsListModel {
  /** «9 743 000» — `totalMinor` of GET /api/accounts as it is; the unit beside it is «сум». */
  total: string;
  /** Which rate the dollars are in at: «Доллары — по курсу ЦБ на 14 окт, 12 650 сум». */
  totalNote: string;
  rows: AccountRow[];
  hidden: HiddenAccountRow[];
  /** «Скрытые счета · 1»; null when nothing is hidden. */
  hiddenLabel: string | null;
  /** A transfer needs two visible accounts; the button says so when there is one (design-system). */
  transfer: { available: boolean; label: string };
}

const rateText = (rateMinor: number) => formatMinor(rateMinor, 'UZS', { unit: false });

/**
 * The accounts screen (FT-118, AccountList.md) from GET /api/accounts: the total exactly as the server counts it,
 * the rate named under it (money-model, rule 1), the visible accounts in their order with «≈ … сум» under a dollar
 * one so the total can be checked by eye, and the hidden ones counted at the end.
 */
export function accountsListModel(overview: AccountsOverview, today: LocalDate): AccountsListModel {
  const visible = visibleAccounts(overview.accounts);
  const hidden = overview.accounts.filter((account) => account.isHidden);
  const rate = overview.rate;
  const hasUsd = visible.some((account) => account.currency === 'USD');

  let totalNote = 'Все счета в сумах';
  if (overview.missingRate) totalNote = 'Доллары не вошли в итог: курса пока нет';
  else if (hasUsd && rate?.source === 'own') totalNote = `Доллары — по своему курсу ${rateText(rate.rateMinor)} сум`;
  else if (hasUsd && rate) totalNote = `Доллары — по курсу ЦБ на ${dayMonthShort(rate.date, today)}, ${rateText(rate.rateMinor)} сум`;

  return {
    total: formatMinor(overview.totalMinor, 'UZS', { unit: false }),
    totalNote,
    rows: visible.map((account) => {
      const balance = formatMinor(account.balanceMinor, account.currency);
      const inUzsMinor = account.currency === 'USD' && rate ? usdToUzsMinor(account.balanceMinor, rate.rateMinor) : null;
      const inUzs = inUzsMinor === null ? null : formatMinor(inUzsMinor, 'UZS');
      return {
        id: account.id,
        name: account.name,
        caption: accountCaption(account),
        icon: accountIcon(account),
        balance,
        inUzs: inUzs && `≈${NBSP}${inUzs}`,
        ariaLabel: `${account.name}, ${balance}${inUzs ? `, примерно ${inUzs}` : ''}. Открыть счёт`,
      };
    }),
    hidden: hidden.map((account) => ({
      id: account.id,
      name: account.name,
      balance: formatMinor(account.balanceMinor, account.currency),
      ariaLabel: `Показать счёт «${account.name}»`,
    })),
    hiddenLabel: hidden.length > 0 ? `Скрытые счета · ${hidden.length}` : null,
    transfer:
      visible.length >= 2
        ? { available: true, label: 'Перевод или обмен' }
        : { available: false, label: 'Для перевода нужен второй счёт' },
  };
}
