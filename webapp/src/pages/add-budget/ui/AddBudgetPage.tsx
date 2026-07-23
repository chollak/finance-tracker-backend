import { CreateBudget } from '@/features/create-budget';
import { FormPageHeader } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useIsGuest } from '@/entities/user/model/store';
import { GuestFeatureBlock } from '@/features/auth';

/**
 * Add Budget Page
 * Dedicated page for creating new budgets
 * Guest users see login prompt
 */
export function AddBudgetPage() {
  const navigate = useNavigate();
  const isGuest = useIsGuest();

  // Guest users: show login prompt
  if (isGuest) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <FormPageHeader title="Новый бюджет" onBack={() => navigate(-1)} />
        <GuestFeatureBlock
          title="Бюджеты доступны после входа"
          description="Войдите через Telegram, чтобы создавать бюджеты и отслеживать лимиты."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <FormPageHeader
        title="Новый бюджет"
        subtitle="Создайте план расходов"
        onBack={() => navigate(-1)}
      />

      {/* Create Budget Feature */}
      <CreateBudget onSuccess={() => navigate(ROUTES.BUDGETS)} />
    </div>
  );
}
