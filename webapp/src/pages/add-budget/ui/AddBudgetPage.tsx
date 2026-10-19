import { CreateBudget } from '@/features/create-budget';
import { FormPageHeader, PageShell } from '@/shared/ui';
import { useIsGuest } from '@/entities/user/model/store';
import { GuestFeatureBlock } from '@/features/auth';

/**
 * Add Budget Page
 * Dedicated page for creating new budgets
 * Guest users see login prompt
 */
export function AddBudgetPage() {
  const isGuest = useIsGuest();

  // Guest users: show login prompt
  if (isGuest) {
    return (
      <PageShell className="max-w-2xl">
        <FormPageHeader title="Новый бюджет" />
        <GuestFeatureBlock
          title="Бюджеты доступны после входа"
          description="Войдите через Telegram, чтобы создавать бюджеты и отслеживать лимиты."
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-2xl">
      <FormPageHeader
        title="Новый бюджет"
        subtitle="Создайте план расходов"
      />

      {/* Create Budget Feature: a created budget closes the form the way «Назад» does */}
      <CreateBudget />
    </PageShell>
  );
}
