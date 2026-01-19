import { useParams, useNavigate } from 'react-router-dom';
import { useDebtWithPayments, usePayDebt, usePayDebtFull, useCancelDebt, useDeleteDebt, debtToViewModel } from '@/entities/debt';
import { useUserStore } from '@/entities/user/model/store';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { Input } from '@/shared/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { ArrowLeft, Trash2, Ban, CreditCard, CheckCircle } from 'lucide-react';
import { ROUTES } from '@/shared/lib/constants/routes';
import { formatCurrency } from '@/shared/lib/formatters';
import { formatRelativeDate } from '@/shared/lib/formatters';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';

/**
 * Debt Details Page
 * Shows debt info with payment history and actions
 */
export function DebtDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);

  const { data: debtData, isLoading } = useDebtWithPayments(id || null);
  const payDebt = usePayDebt(userId || '');
  const payDebtFull = usePayDebtFull(userId || '');
  const cancelDebt = useCancelDebt(userId || '');
  const deleteDebt = useDeleteDebt(userId || '');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!debtData) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 text-center">
        <p className="text-muted-foreground">Долг не найден</p>
        <Button onClick={() => navigate(ROUTES.DEBTS)} className="mt-4">
          Вернуться к списку
        </Button>
      </div>
    );
  }

  const debt = debtToViewModel(debtData);
  const isActive = debt.status === 'active';

  const handlePartialPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      await payDebt.mutateAsync({
        debtId: debt.id,
        data: { amount, note: paymentNote || undefined },
      });
      toast.success('Платёж записан');
      setPaymentAmount('');
      setPaymentNote('');
    } catch (error) {
      toast.error('Не удалось записать платёж');
    }
  };

  const handleFullPayment = async () => {
    try {
      await payDebtFull.mutateAsync({ debtId: debt.id });
      toast.success('Долг погашен полностью');
    } catch (error) {
      toast.error('Не удалось погасить долг');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelDebt.mutateAsync(debt.id);
      toast.success('Долг отменён');
    } catch (error) {
      toast.error('Не удалось отменить долг');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDebt.mutateAsync(debt.id);
      toast.success('Долг удалён');
      navigate(ROUTES.DEBTS);
    } catch (error) {
      toast.error('Не удалось удалить долг');
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{debt.personName}</h1>
          <p className="text-muted-foreground">{debt._typeLabel}</p>
        </div>
        <span className={cn('text-sm px-3 py-1 rounded-full', debt._statusColor, 'bg-current/10')}>
          {debt._statusLabel}
        </span>
      </div>

      {/* Main Info Card */}
      <Card className={cn(
        'p-6 mb-6',
        debt._isOverdue && 'border-red-200 bg-red-50/50'
      )}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">{debt._typeIcon}</div>
          <div className={cn('text-3xl font-bold', debt._amountColor)}>
            {debt._formattedRemainingAmount}
          </div>
          {debt.remainingAmount !== debt.originalAmount && (
            <div className="text-muted-foreground">
              из {debt._formattedOriginalAmount}
            </div>
          )}
        </div>

        {/* Progress */}
        {debt._progressPercent > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Погашено {debt._formattedPaidAmount}</span>
              <span>{debt._progressPercent}%</span>
            </div>
            <Progress value={debt._progressPercent} className="h-3" />
          </div>
        )}

        {/* Info */}
        <div className="space-y-2 text-sm">
          {debt.description && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Описание:</span>
              <span>{debt.description}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Создан:</span>
            <span>{debt._formattedDate}</span>
          </div>
          {debt.dueDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Срок:</span>
              <span className={cn(debt._isOverdue && 'text-red-600 font-medium')}>
                {debt._isOverdue ? 'Просрочено!' : debt._formattedDueDate}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Actions */}
      {isActive && (
        <Card className="p-4 mb-6">
          <h2 className="font-semibold mb-4">Внести платёж</h2>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <Input
                placeholder="Заметка (необязательно)"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handlePartialPayment}
                disabled={payDebt.isPending}
                className="flex-1"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {payDebt.isPending ? 'Сохранение...' : 'Записать платёж'}
              </Button>
              <Button
                variant="outline"
                onClick={handleFullPayment}
                disabled={payDebtFull.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {payDebtFull.isPending ? '...' : 'Погасить полностью'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Payment History */}
      {debtData.payments && debtData.payments.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="font-semibold mb-4">История платежей</h2>
          <div className="space-y-3">
            {debtData.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <div className="font-medium text-income">
                    +{formatCurrency(payment.amount)}
                  </div>
                  {payment.note && (
                    <div className="text-sm text-muted-foreground">{payment.note}</div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatRelativeDate(payment.paidAt)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="p-4 border-red-200">
        <h2 className="font-semibold text-red-600 mb-4">Действия</h2>
        <div className="flex gap-2">
          {isActive && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Ban className="h-4 w-4 mr-2" />
                  Отменить долг
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Отменить долг?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Долг будет помечен как отменённый. Это действие можно отменить вручную.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel}>
                    Отменить долг
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="flex-1">
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить долг?</AlertDialogTitle>
                <AlertDialogDescription>
                  Это действие нельзя отменить. Долг и вся история платежей будут удалены навсегда.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  );
}
