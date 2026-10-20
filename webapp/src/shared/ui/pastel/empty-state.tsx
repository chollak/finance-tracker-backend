import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** A line icon, 30px, drawn in `ink` inside the 72px circle. */
  icon: ReactNode;
  title: string;
  text: string;
  /** «Сбросить поиск и фильтры» when something can be undone; nothing for an empty history. */
  action?: ReactNode;
}

/**
 * An empty result (docs/pastel/components/EmptyState.md): a 72px circle on `track` with the icon, the title in the
 * section style, the text up to 290px wide in `muted`, and an optional way out. Role `status`: it is the answer to
 * what was asked. No pastel — pastel is for categories and money.
 */
export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-2.5 px-6 pb-6 pt-12 text-center">
      <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-pill bg-track text-ink [&_svg]:size-[30px]">
        {icon}
      </span>
      <h2 className="type-section mt-1.5 text-ink">{title}</h2>
      <p className="max-w-[290px] text-[14px] font-medium leading-[1.45] text-ink-muted">{text}</p>
      {action}
    </div>
  );
}
