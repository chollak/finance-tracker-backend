import { CreateDebt } from '@/features/create-debt';
import { FormPageHeader } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useIsGuest } from '@/entities/user/model/store';
import { GuestFeatureBlock } from '@/features/auth';

/**
 * Add Debt Page
 * Dedicated page for creating new debts
 * Guest users see login prompt
 */
export function AddDebtPage() {
  const navigate = useNavigate();
  const isGuest = useIsGuest();

  // Guest users: show login prompt
  if (isGuest) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <FormPageHeader title="Новый долг" onBack={() => navigate(-1)} />
        <GuestFeatureBlock
          title="Долги доступны после входа"
          description="Войдите через Telegram, чтобы отслеживать долги и платежи."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <FormPageHeader
        title="Новый долг"
        subtitle="Добавьте запись о долге"
        onBack={() => navigate(-1)}
      />

      {/* Create Debt Feature */}
      <CreateDebt onSuccess={() => navigate(ROUTES.DEBTS)} />
    </div>
  );
}
