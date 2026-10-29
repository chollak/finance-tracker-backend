import { useState } from 'react';
import { Banknote, CreditCard, DollarSign, Wallet } from 'lucide-react';
import { accountIcon, type Account, type AccountIcon } from '@/entities/account';
import { AccountPicker, SettingsRow } from '@/shared/ui/pastel';
import { useDefaultAccount } from '../api/useDefaultAccount';

const TITLE = 'Счёт по умолчанию';
const LOAD_FAILED = 'Не загрузилось. Нажмите, чтобы повторить';

const ICONS: Record<AccountIcon, typeof Wallet> = { cash: Banknote, card: CreditCard, usd: DollarSign };

/** The type of the account records go to, as the accounts list draws it (AccountList.md); a wallet until it is known. */
function RowIcon({ account }: { account: Account | null | undefined }) {
  const Icon = account ? ICONS[accountIcon(account)] : Wallet;
  return <Icon strokeWidth={1.8} />;
}

/**
 * «Счёт по умолчанию» (FT-149) — a row of «Ещё» → «Деньги» that opens a sheet (SettingsList.md): it says which account
 * new records go to now, and why when it is not the chosen one («первый в списке», «счёт «Карта» скрыт»). The sheet is
 * the account choice of Picker.md: the visible accounts with their balance, the current one checked; a press saves it,
 * closes the sheet and shows in the row at once. Nothing to choose without a visible account.
 */
export function DefaultAccountRow() {
  const [open, setOpen] = useState(false);
  const { view, failed, retrying, retry, choose } = useDefaultAccount();
  const icon = <RowIcon account={view?.account} />;

  if (view?.account) {
    return (
      <>
        <SettingsRow kind="sheet" onClick={() => setOpen(true)} icon={icon} title={TITLE} subtitle={view.state} />
        <AccountPicker
          open={open}
          onOpenChange={setOpen}
          title={TITLE}
          accounts={view.options}
          selectedId={view.account.id}
          onSelect={(picked) => choose(picked.id)}
          footnote={
            <div className="mx-1 flex flex-col gap-1.5">
              {view.notes.map((note) => (
                <p key={note} className="text-[13px] font-semibold leading-[1.45] text-ink-muted">
                  {note}
                </p>
              ))}
            </div>
          }
        />
      </>
    );
  }
  if (view) return <SettingsRow kind="static" icon={icon} title={TITLE} subtitle={view.state} />;
  if (failed) return <SettingsRow kind="action" onClick={retry} disabled={retrying} icon={icon} title={TITLE} subtitle={LOAD_FAILED} />;
  return <SettingsRow kind="action" onClick={() => {}} disabled icon={icon} title={TITLE} />;
}
