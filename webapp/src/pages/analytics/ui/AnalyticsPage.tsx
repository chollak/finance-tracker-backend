import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMonthAnalytics, type AnalyticsType } from '@/entities/analytics';
import { findCategory, useCategories } from '@/entities/category';
import { useIsGuest } from '@/entities/user';
import { ANALYTICS_MONTH_PARAM, ANALYTICS_TYPE_PARAM, ROUTES } from '@/shared/lib/constants/routes';
import { cn } from '@/shared/lib/utils';
import { BackButton, EmptyState, Segmented, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import { monthOverview, monthStepper } from '../model/monthOverview';
import { monthParam } from '../model/periodWords';
import { AnalyticsHeroView, CategoryBarsView, MonthStepperView } from './MonthParts';
import { BARS_ICON, FOCUS, GuestAnalytics, LoadingRows, ReadFailed } from './parts';

const SIDES = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
] as const;

/** The hero and the list while the month is read: their shapes, no spinner (Skeleton.md). */
function LoadingMonth() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-hero bg-primary px-5 pb-5 pt-4" aria-hidden="true">
        <SkeletonBlock className="h-3.5 w-36 bg-hero-track" />
        <SkeletonBlock radius="tile" className="h-11 w-52 bg-hero-track" />
        <SkeletonBlock className="h-3 w-60 bg-hero-track" />
        <SkeletonBlock className="mt-3 h-4 w-64 bg-hero-track" />
      </div>
      <SkeletonBlock className="ml-1 mt-1 h-4 w-32" />
      <LoadingRows rows={5} />
      <span className="sr-only" role="status">
        Загружаю аналитику…
      </span>
    </div>
  );
}

/**
 * Analytics (FT-121, row «Аналитика — куда уходят деньги»): where the money of a month went, from
 * `GET /api/analytics` (FT-120). On top, staying while the rest scrolls: «Назад», the month stepper (hidden while
 * there is one month only) and «Расходы / Доходы». Under them the total with its fair comparison and one insight,
 * then the categories as bars with the tick of the previous period; a category opens its own screen. The month and
 * the side are in the address (`?month=2026-09&type=income`), so Home's income tile opens the income and «Назад»
 * from a category returns to the same month. An empty month leads to the first record.
 */
export function AnalyticsPage() {
  const isGuest = useIsGuest();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const month = monthParam(params.get(ANALYTICS_MONTH_PARAM));
  const type: AnalyticsType = params.get(ANALYTICS_TYPE_PARAM) === 'income' ? 'income' : 'expense';
  const analytics = useMonthAnalytics({ month, type });
  const categories = useCategories();

  if (isGuest) return <GuestAnalytics />;

  // While another month or side is read, the answer before keeps the stepper in place
  const known = analytics.data;
  const data = known && !analytics.isPlaceholderData ? known : undefined;
  // No month in the address is the current month, even while the answer of another month is still shown
  const shownMonth = month ?? known?.currentMonth;
  const stepper = known && shownMonth ? monthStepper(shownMonth, known) : null;
  // The current month has no month in the address: it is the same screen whichever way it was opened
  const show = (view: { month?: string; type: AnalyticsType }) =>
    navigate(ROUTES.ANALYTICS_VIEW({ month: view.month === known?.currentMonth ? undefined : view.month, type: view.type }), { replace: true });

  let content;
  if (analytics.isError) {
    content = <ReadFailed text="Не удалось загрузить аналитику." onRetry={() => void analytics.refetch()} retrying={analytics.isFetching} />;
  } else if (!data) {
    content = <LoadingMonth />;
  } else {
    const view = monthOverview(data, (categoryId) => findCategory(categories.data, categoryId)?.color);
    content =
      view.kind === 'empty' ? (
        // The board's empty month sits 64px under the switch, 16px lower than History's empty list
        <div className="pt-4">
          <EmptyState
            icon={BARS_ICON}
            title={view.title}
            text={view.text}
            action={
              view.action && (
                <Link
                  to={ROUTES.MANUAL_ENTRY}
                  className={cn('mt-2 flex h-key items-center rounded-pill bg-primary px-[22px] text-[15px] font-extrabold text-on-primary', FOCUS)}
                >
                  {view.action}
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <AnalyticsHeroView hero={view.hero} />
          <CategoryBarsView
            label={view.listLabel}
            legend={view.legend}
            rows={view.rows}
            footnote={view.footnote}
            onOpen={(categoryId) => navigate(ROUTES.ANALYTICS_CATEGORY(categoryId, data.month))}
          />
        </>
      );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-24 text-ink">
      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-bg px-4 pb-2 pt-2">
        <header className="flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section">Аналитика</h1>
        </header>
        {stepper && <MonthStepperView stepper={stepper} onMonth={(next) => show({ month: next, type })} />}
        <Segmented options={SIDES} value={type} onChange={(side) => show({ month: shownMonth, type: side })} ariaLabel="Что показать" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1">{content}</div>

      {/* «Удалено» of a record deleted on a category's screen stays after «Назад» */}
      <UndoToast />
    </div>
  );
}
