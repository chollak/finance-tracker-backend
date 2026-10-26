import { useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker } from 'react-router-dom';
import { useAccounts, type Account } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useUsdRate } from '@/entities/rate';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toLocalDate } from '@/shared/lib/dates';
import { useShowHomeAfterSave } from '@/shared/lib/navigation';
import { AccountPicker, CalendarSheet, CategoryPicker, UndoToast } from '@/shared/ui/pastel';
import { useCaptureReview } from '../api/useCaptureReview';
import { accountChoices, categoryChoices, findItem, reviewModel, type ReviewContext } from '../model/captureReview';
import { useCaptureStore } from '../model/captureStore';
import { CaptureReviewView } from './CaptureReviewView';

const NO_ACCOUNTS: readonly Account[] = [];

type Picker = { id: string; kind: 'category' | 'account' | 'date' } | null;

/**
 * The review screen of a sent phrase (FT-114): the records the capture saved, the pickers of the category,
 * the account and the date, and the toast of «×». Any way out but «Сохранить» — «Изменить», its own «Назад»,
 * Telegram's BackButton — takes the records back and returns the phrase to Home's field; a blocker on the
 * route catches them all. Opened without a phrase (a reload) it shows Home: the records stay saved.
 */
export function CaptureReview() {
  const [today] = useState(() => toLocalDate(new Date()));
  const session = useCaptureStore((state) => state.review);
  const categories = useCategories();
  const accountsQuery = useAccounts();
  const rate = useUsdRate();
  const showHome = useShowHomeAfterSave();
  const [picker, setPicker] = useState<Picker>(null);
  const [leaving, setLeaving] = useState(false);
  // Read when a navigation starts: the press of «Сохранить» leaves without taking anything back
  const settled = useRef(false);

  const context: ReviewContext = {
    categories: categories.data ?? [],
    accounts: accountsQuery.data?.accounts ?? NO_ACCOUNTS,
    rateMinor: rate.data?.effective?.rateMinor ?? null,
    today,
  };
  const review = useCaptureReview(context);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !settled.current && useCaptureStore.getState().review !== null && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    setPicker(null);
    setLeaving(true);
    void review.cancel(() => {
      settled.current = true;
      blocker.proceed();
    }).finally(() => {
      setLeaving(false);
      if (!settled.current) blocker.reset();
    });
    // The blocker is a new object each render; its state is what starts this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  if (!session) {
    // Left after «Сохранить» or «Изменить»; or opened without a phrase (a reload): Home
    return settled.current ? null : <Navigate to={ROUTES.HOME} replace />;
  }

  const model = reviewModel(session, context);
  const item = picker ? findItem(session, picker.id) : undefined;
  const close = (open: boolean) => {
    if (!open) setPicker(null);
  };

  const onSave = () => {
    settled.current = true;
    review.save();
  };

  const onEdit = () => {
    setLeaving(true);
    void review
      .cancel(() => {
        settled.current = true;
        showHome();
      })
      .finally(() => setLeaving(false));
  };

  const categoryPicker = picker?.kind === 'category' ? categoryChoices(session, picker.id, context) : null;

  return (
    <>
      <CaptureReviewView
        model={model}
        busy={leaving}
        onEdit={onEdit}
        onSave={onSave}
        onCategory={(id) => setPicker({ id, kind: 'category' })}
        onAccount={(id) => setPicker({ id, kind: 'account' })}
        onDate={(id) => setPicker({ id, kind: 'date' })}
        onRemove={(id) => void review.remove(id)}
        onConvert={(id) => void review.convert(id)}
      />

      <CategoryPicker
        open={!!categoryPicker}
        onOpenChange={close}
        title={categoryPicker?.title ?? 'Категория расхода'}
        groups={[{ categories: categoryPicker?.categories ?? [] }]}
        selectedId={categoryPicker?.selectedId}
        guessedId={categoryPicker?.guessedId}
        onSelect={(category) => picker && void review.chooseCategory(picker.id, category.id)}
      />
      <AccountPicker
        open={picker?.kind === 'account'}
        onOpenChange={close}
        accounts={accountChoices(context)}
        selectedId={item?.accountId}
        onSelect={(account) => picker && void review.chooseAccount(picker.id, account.id)}
      />
      <CalendarSheet
        open={picker?.kind === 'date'}
        onOpenChange={close}
        value={item?.date ?? today}
        today={today}
        onSelect={(date) => picker && void review.chooseDate(picker.id, date)}
      />

      {/* «Убрано» with «Отменить», over the main button (board: 88px from the bottom) */}
      <UndoToast bottom={88} />
    </>
  );
}
