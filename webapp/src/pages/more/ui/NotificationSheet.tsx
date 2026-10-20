import type { UserSettings } from '@/entities/settings';
import { Button, ChoiceChips, Sheet, SwitchRow } from '@/shared/ui/pastel';
import { NOTIFICATIONS, notificationState, type NotificationKind } from '../model/moreScreen';

interface NotificationSheetProps {
  kind: NotificationKind;
  onClose: () => void;
  settings: UserSettings;
  onChange: (change: { on: boolean } | { time: string }) => void;
}

/**
 * «Сводка дня», «Звать на ревизию», «Цели и подписки» (FT-125, board «Сводка дня в боте»; Switch.md): what the bot
 * sends and when, the switch and, while it is on, the time. A change applies at once and is saved; «Готово» only
 * closes the sheet.
 */
export function NotificationSheet({ kind, onClose, settings, onChange }: NotificationSheetProps) {
  const spec = NOTIFICATIONS[kind];
  const current = notificationState(kind, settings);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={spec.title}>
      <p className="mx-1 text-[14px] font-medium leading-[1.5] text-ink">{spec.text}</p>
      <div className="flex flex-col rounded-card bg-sheet-card px-4">
        <SwitchRow label={spec.switchLabel} checked={current.on} onChange={(on) => onChange({ on })} />
        {current.on && spec.time && (
          <div className="flex flex-col gap-2 border-t border-line pb-4 pt-3">
            <span className="text-[13px] font-bold text-ink-muted">{spec.time.label}</span>
            <ChoiceChips
              ariaLabel={spec.time.label}
              value={current.time}
              onChange={(time) => onChange({ time })}
              options={spec.time.options.map((time) => ({ value: time, label: time }))}
              className="grid grid-cols-4"
            />
          </div>
        )}
      </div>
      {spec.note && <p className="mx-1 text-[13px] font-semibold leading-[1.45] text-ink-muted">{spec.note}</p>}
      <Button inSheet onClick={onClose}>
        Готово
      </Button>
      <p role="status" className="sr-only">
        {`${spec.title}: ${current.state}`}
      </p>
    </Sheet>
  );
}
