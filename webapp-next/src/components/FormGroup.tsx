import type { ReactNode } from 'react';

/** Сгруппированный список: белая карточка, строки внутри, волосяные разделители. */
export function FormGroup({ children }: { children: ReactNode[] }) {
  const rows = children.filter(Boolean);

  return (
    <div className="overflow-hidden rounded-[var(--radius-group)] bg-surface">
      {rows.map((row, i) => (
        <div key={i}>
          {i > 0 && <div className="ml-[18px] h-px bg-line" />}
          {row}
        </div>
      ))}
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[58px] items-center gap-3 px-[18px]">{children}</div>;
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <div className="shrink-0 text-[16px] tracking-[-0.01em]">{children}</div>;
}
