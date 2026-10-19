import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  ChevronRight,
  CircleUser,
  HandCoins,
  Keyboard,
  Mic,
  PenSquare,
  ScanLine,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, PageHeader, PageShell } from '@/shared/ui';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { env } from '@/shared/config/env';
import { ROUTES } from '@/shared/lib/constants/routes';
import { requestCaptureFocus } from '@/shared/lib/captureFocus';
import { useTelegram } from '@/shared/hooks/useTelegram';
import { useIsGuest, useUserStore } from '@/entities/user/model/store';
import { GuestModeBanner } from '@/features/auth';
import {
  getMoreCaptureChannels,
  type CaptureChannelId,
  type MoreCaptureChannel,
} from '../model/moreCaptureChannels';

const CHANNEL_ICONS: Record<CaptureChannelId, LucideIcon> = {
  text: Keyboard,
  voice: Mic,
  shortcut: Smartphone,
  manual: PenSquare,
  scan: ScanLine,
};

const notDailyItems = [
  {
    href: ROUTES.BUDGETS,
    title: 'Бюджеты',
    description: 'Лимиты по категориям и прогресс месяца',
    icon: Wallet,
  },
  {
    href: ROUTES.DEBTS,
    title: 'Долги',
    description: 'Кому должны вы и кто должен вам',
    icon: HandCoins,
  },
  {
    href: ROUTES.ANALYTICS,
    title: 'Аналитика',
    description: 'Категории, тренды и финансовые отчёты',
    icon: BarChart3,
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface RowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Right-hand state word; omitted for rows whose destination speaks for itself. */
  status?: string;
  /** `false` mutes the row and drops the chevron — it explains rather than leads somewhere. */
  isAvailable?: boolean;
  /** `false` renders a plain card instead of something that looks pressable. */
  isInteractive?: boolean;
}

/**
 * The state word sits in its own column rather than beside the title: sharing a line, the badge
 * stole enough width to wrap every second heading onto a second line.
 */
function RowBody({ icon: Icon, title, description, status, isAvailable = true, isInteractive = true }: RowProps) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          isAvailable ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            'truncate font-semibold leading-tight',
            !isAvailable && 'text-muted-foreground'
          )}
        >
          {title}
        </h3>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{description}</p>
      </div>

      {status ? (
        <Badge variant={isAvailable ? 'secondary' : 'outline'} className="shrink-0 text-[11px]">
          {status}
        </Badge>
      ) : (
        isInteractive && (
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )
      )}
    </div>
  );
}

const CARD_BASE = 'px-4 py-3';
const CARD_INTERACTIVE = 'transition-colors active:bg-muted/60 hover:bg-muted/40';

/**
 * More — the secondary hub (FT-082).
 *
 * Two jobs, in this order. First it explains **how an operation gets recorded at all**: every
 * channel the product has, each saying where its capture actually happens and whether it exists
 * yet. That belongs here rather than on Home because Home is for doing the capture, not for
 * reading about it — but the knowledge has to live somewhere, and until now it lived only in a
 * repo document nobody opens from a phone.
 *
 * Second it holds the sections that are real and working but not part of the daily loop —
 * budgets, debts, analytics. They are labelled «Не каждый день», never as disabled or broken.
 *
 * There is no «Настройки» group because the app has no setting that persists anything. Rendering
 * an empty settings section, or a toggle that forgets itself on reload, would be the fake
 * capability this milestone keeps refusing to ship.
 */
export function MorePage() {
  const isGuest = useIsGuest();
  const userName = useUserStore((state) => state.userName);
  const { isTelegram, webApp } = useTelegram();

  const botUsername = env.telegramBotUsername;
  const botLink = botUsername ? `https://t.me/${botUsername}` : null;

  const channels = getMoreCaptureChannels({ isGuest, hasBotLink: !!botLink });

  /**
   * Hand the bot link to whoever can open it without destroying the app.
   *
   * Inside Telegram that is `openTelegramLink`, which switches to the chat and leaves the Mini
   * App running. Everywhere else the anchor's own `target="_blank"` does it — deliberately *not*
   * `window.open`, which was measured replacing the current document rather than opening a tab
   * (`/more` → `https://t.me/…` in the same frame). In a Mini App webview that is a one-way
   * trip out of the app.
   */
  const handleBotLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!botLink) return;

    if (isTelegram && webApp?.openTelegramLink) {
      event.preventDefault();
      webApp.openTelegramLink(botLink);
    }
  };

  const renderChannel = (channel: MoreCaptureChannel) => {
    const row: RowProps = {
      icon: CHANNEL_ICONS[channel.id],
      title: channel.title,
      description: channel.description,
      status: channel.status,
      isAvailable: channel.isAvailable,
      isInteractive: channel.action !== 'none',
    };

    if (channel.action === 'route' && channel.href) {
      return (
        <Link key={channel.id} to={channel.href} className="block">
          <Card className={cn(CARD_BASE, CARD_INTERACTIVE)}>
            <RowBody {...row} />
          </Card>
        </Link>
      );
    }

    if (channel.action === 'capture') {
      return (
        <Link
          key={channel.id}
          to={ROUTES.HOME}
          className="block"
          // A latched request: the capture card picks it up when Home mounts, so the press is not
          // swallowed by the route change.
          onClick={() => requestCaptureFocus()}
        >
          <Card className={cn(CARD_BASE, CARD_INTERACTIVE)}>
            <RowBody {...row} />
          </Card>
        </Link>
      );
    }

    if (channel.action === 'telegram' && botLink) {
      return (
        <a
          key={channel.id}
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleBotLinkClick}
          className="block"
        >
          <Card className={cn(CARD_BASE, CARD_INTERACTIVE)}>
            <RowBody {...row} />
          </Card>
        </a>
      );
    }

    return (
      <Card key={channel.id} className={cn(CARD_BASE, !channel.isAvailable && 'bg-muted/30')}>
        <RowBody {...row} />
      </Card>
    );
  };

  return (
    <PageShell>
      <PageHeader title="Ещё" subtitle="Как записывать операции и разделы не на каждый день" />

      <Section title="Как записать">{channels.map(renderChannel)}</Section>

      <Section title="Аккаунт">
        {isGuest ? (
          <GuestModeBanner />
        ) : (
          <Card className={CARD_BASE}>
            <RowBody
              icon={CircleUser}
              title={userName || 'Аккаунт Telegram'}
              description="Данные на сервере — видны и в боте, и здесь"
              isInteractive={false}
            />
          </Card>
        )}
      </Section>

      <Section title="Не каждый день">
        {notDailyItems.map((item) => (
          <Link key={item.href} to={item.href} className="block">
            <Card className={cn(CARD_BASE, CARD_INTERACTIVE)}>
              <RowBody icon={item.icon} title={item.title} description={item.description} />
            </Card>
          </Link>
        ))}
      </Section>
    </PageShell>
  );
}
