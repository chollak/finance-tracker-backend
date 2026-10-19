import { Clock3 } from 'lucide-react';
import { BackButton, ProblemScreen } from '@/shared/ui/pastel';
import { useCloseScreen } from '@/shared/lib/navigation';

/**
 * «Все счета и курс доллара» from the balance card on Home leads here (FT-111 review). The screen of the
 * accounts and the rate comes with FT-118; until then this says so honestly instead of «Страница не
 * найдена», built from the one template for situations (ProblemScreen.md). It is a nested screen: «Назад»
 * is Telegram's BackButton or its own, and the one exit returns to Home, where the card already shows each
 * account's balance.
 */
export function AccountsPage() {
  const close = useCloseScreen();

  return (
    <ProblemScreen
      header={<BackButton />}
      icon={<Clock3 strokeWidth={1.9} />}
      title="Счета и курс доллара"
      text="Счета и курс появятся здесь. Пока остаток каждого счёта видно на главной, в карточке баланса."
      action={{ label: 'На главную', onClick: close }}
    />
  );
}
