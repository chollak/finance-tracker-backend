import { useQueryClient } from '@tanstack/react-query';
import { useIsTelegramUser } from '@/entities/user';
import { cn } from '@/shared/lib/utils';
import { Button, SkeletonBlock, Wordmark } from '@/shared/ui/pastel';
import { useSlowLoading } from '../model/slowLoading';
import { retryUnanswered } from '../model/retryUnanswered';

/** What a screen reader hears; the visible line below the shapes says the same in its own words. */
const LOADING_STATUS = 'Загружаю ваши счета и записи';
const SLOW_STATUS = 'Загрузка идёт дольше обычного. Проверьте связь — записи не потеряются.';
const LOADING_NOTE = 'Загружаю ваши счета и записи…';
const SLOW_NOTE = 'Дольше обычного — похоже, слабая связь. Записи не пропадут: они хранятся на сервере.';

/** The two lines of each record row, as wide as on the board. */
const ROWS = [
  { title: 'w-[55%]', note: 'w-[35%]' },
  { title: 'w-[45%]', note: 'w-1/2' },
  { title: 'w-[60%]', note: 'w-[30%]' },
  { title: 'w-[40%]', note: 'w-[45%]' },
];

/** The composer's quick chips at the bottom, as the board draws them. */
const CHIPS = [0, 1, 2];

export interface HomeSkeletonViewProps {
  /** Six seconds have passed: the message and «Попробовать снова» take the place of the note. */
  slow: boolean;
  onRetry: () => void;
}

/**
 * The skeleton as the boards «Загрузка», «Загрузка дольше обычного», «Загрузка · тёмная» draw it, from the
 * slow flag; `HomeSkeleton` keeps the time. Grey shapes of Home's own layout in Home's own frame (page
 * gutter, 48px header, 16px between sections), so nothing moves when Home comes (Skeleton.md): the daftar
 * sign, the balance card in `primary` with stripes in `hero-track` (lighter in the light theme, darker in the
 * dark one), the two month tiles, the heading and the card of records, the composer at the bottom. The shapes
 * pulse (`SkeletonBlock`, still under prefers-reduced-motion); there is no spinner.
 *
 * Every shape is as tall as what replaces it: the balance card's rows (a 44px header row, the 48px amount,
 * the bar and the line under it), the 80px tiles, the 44px row of the records' heading and the day line over
 * the list. At the bottom, under the note, the composer as Home has it (FT-114): three chips, the 56px field
 * on `card` and the round button; the slow state puts its message and «Попробовать снова» there instead. The
 * board has a «Сум / USD» switch beside «Ещё»; Home's header has none yet (docs/pastel/handoff.md, item 8),
 * so neither has the skeleton. «Записывать без связи» under the slow state comes with the offline mode
 * (FT-129).
 *
 * Only the shapes are `aria-busy`: the status line and the slow message with its button stay outside, so a
 * screen reader announces them and lets the button be pressed while the shapes still wait.
 */
export function HomeSkeletonView({ slow, onRetry }: HomeSkeletonViewProps) {
  // With the message and the button at the bottom the list is shorter, so everything fits
  const rows = slow ? ROWS.slice(0, 3) : ROWS;

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-2">
        <p role="status" className="sr-only">
          {slow ? SLOW_STATUS : LOADING_STATUS}
        </p>

        <div aria-busy="true" className="flex shrink-0 flex-col gap-4">
          {/* The real header: the sign is there at once, «Ещё» waits as a circle */}
          <header className="flex h-key shrink-0 items-center justify-between gap-3">
            <Wordmark />
            <SkeletonBlock className="size-key" />
          </header>

          <div aria-hidden="true" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 rounded-hero bg-primary px-5 pb-5 pt-3">
              <span className="flex min-h-touch items-center">
                <SkeletonBlock className="h-3.5 w-[120px] bg-hero-track" />
              </span>
              <span className="flex h-12 items-center">
                <SkeletonBlock radius="tile" className="h-11 w-[220px] max-w-full bg-hero-track" />
              </span>
              <span className="mt-2.5 flex flex-col gap-2">
                <SkeletonBlock className="h-2 w-full bg-hero-track" />
                <span className="flex h-5 items-center">
                  <SkeletonBlock className="h-3 w-[180px] max-w-full bg-hero-track" />
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SkeletonBlock radius="card" className="h-20" />
              <SkeletonBlock radius="card" className="h-20" />
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <span className="flex h-touch items-center">
                <SkeletonBlock className="h-5 w-[200px]" />
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="flex h-[18px] items-center">
                  <SkeletonBlock className="h-3 w-16" />
                </span>
                <ul className="rounded-card bg-card px-4 py-1">
                  {rows.map((row, index) => (
                    <li key={index} className="flex h-row items-center gap-3">
                      <SkeletonBlock className="size-10 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <SkeletonBlock className={cn('h-3', row.title)} />
                        <SkeletonBlock className={cn('h-2.5', row.note)} />
                      </span>
                      <SkeletonBlock className="h-3 w-[72px] shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-bg px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
          <p aria-hidden="true" className="type-label mx-1 text-center text-ink-muted">
            {slow ? SLOW_NOTE : LOADING_NOTE}
          </p>
          {slow ? (
            <Button onClick={onRetry}>Попробовать снова</Button>
          ) : (
            // The composer of Home (FT-114): the quick chips, the field and the round button
            <div aria-hidden="true" className="flex flex-col gap-2.5">
              <span className="flex gap-2">
                {CHIPS.map((index) => (
                  <SkeletonBlock key={index} className="h-touch w-[104px] shrink-0" />
                ))}
              </span>
              <span className="flex gap-2">
                <SkeletonBlock className="h-button flex-1 rounded-pill bg-card" />
                <SkeletonBlock className="size-button shrink-0" />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading of Home (FT-112, Skeleton.md): what the mini app shows from the moment it opens on Home until
 * Home's data is in — while the gate learns about the first launch, while Home's code loads, while its
 * reads answer. After six seconds of it — counted across those steps — it says the loading is slow, and
 * «Попробовать снова» asks again for whatever has not answered yet and gives it six more seconds.
 *
 * The slow message promises records kept on the server, so only a Telegram user gets it. A guest keeps
 * records on the device (and a user not known yet may turn out to be one): the shapes stay without it.
 */
export function HomeSkeleton() {
  const queryClient = useQueryClient();
  const isTelegramUser = useIsTelegramUser();
  const { slow, restart } = useSlowLoading();

  const retry = () => {
    restart();
    void retryUnanswered(queryClient);
  };

  return <HomeSkeletonView slow={slow && isTelegramUser} onRetry={retry} />;
}
