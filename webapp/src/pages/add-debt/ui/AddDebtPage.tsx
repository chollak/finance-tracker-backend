import { CreateDebt } from '@/features/create-debt';
import { FormPageHeader, PageShell } from '@/shared/ui';
import { useIsGuest } from '@/entities/user/model/store';
import { GuestFeatureBlock } from '@/features/auth';

/**
 * Add Debt Page
 * Dedicated page for creating new debts
 * Guest users see login prompt
 */
export function AddDebtPage() {
  const isGuest = useIsGuest();

  // Guest users: show login prompt
  if (isGuest) {
    return (
      <PageShell className="max-w-2xl">
        <FormPageHeader title="Новый долг" />
        <GuestFeatureBlock
          title="Долги доступны после входа"
          description="Войдите через Telegram, чтобы отслеживать долги и платежи."
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Новый долг"
        subtitle="Добавьте запись о долге"
      />

      {/* Create Debt Feature: a created debt closes the form the way «Назад» does */}
      <CreateDebt />
    </PageShell>
  );
}
