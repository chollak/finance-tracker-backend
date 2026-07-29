import React, { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/shared/lib/utils';

export type IconComponentType = React.ElementType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface ModernMobileMenuItem {
  label: string;
  icon: IconComponentType;
  active?: boolean;
  onSelect?: () => void;
  ariaLabel?: string;
  variant?: 'default' | 'primary';
  onPrefetch?: () => void;
}

export interface ModernMobileMenuProps {
  items: ModernMobileMenuItem[];
  className?: string;
}

export function ModernMobileMenu({ items, className }: ModernMobileMenuProps) {
  const finalItems = useMemo(() => items.slice(0, 5), [items]);
  const activeIndex = finalItems.findIndex((item) => item.active);
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const setLineWidth = () => {
      finalItems.forEach((_item, index) => {
        const itemElement = itemRefs.current[index];
        const textElement = textRefs.current[index];
        if (!itemElement || !textElement) return;

        const textWidth = index === activeIndex ? textElement.offsetWidth : 0;
        itemElement.style.setProperty('--line-width', `${textWidth}px`);
      });
    };

    setLineWidth();
    window.addEventListener('resize', setLineWidth);
    return () => window.removeEventListener('resize', setLineWidth);
  }, [activeIndex, finalItems]);

  const renderMenuButton = (item: ModernMobileMenuItem, index: number) => {
    const Icon = item.icon;
    const isActive = Boolean(item.active);
    const isPrimary = item.variant === 'primary';

    return (
      <button
        key={`${item.label}-${index}`}
        ref={(el) => {
          itemRefs.current[index] = el;
        }}
        type="button"
        aria-label={item.ariaLabel || item.label}
        aria-current={isActive ? 'page' : undefined}
        onClick={item.onSelect}
        onMouseEnter={item.onPrefetch}
        onFocus={item.onPrefetch}
        onTouchStart={item.onPrefetch}
        className={cn(
          'group relative flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-3 text-muted-foreground transition-[flex,color,background,box-shadow,transform] duration-300 ease-out active:scale-95',
          isActive
            ? 'flex-[1.35] bg-secondary text-foreground shadow-sm'
            : 'flex-1 hover:bg-secondary/70 hover:text-foreground',
          isPrimary && 'w-[3.75rem] flex-none bg-primary text-primary-foreground shadow-sm shadow-black/10 hover:bg-primary hover:text-primary-foreground',
          isPrimary && isActive && 'bg-primary text-primary-foreground'
        )}
        style={{ '--line-width': '0px' } as React.CSSProperties}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-transform duration-300',
            isActive && 'animate-icon-bounce',
            isPrimary ? 'bg-primary-foreground/10' : 'group-hover:bg-background/70'
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span
          ref={(el) => {
            textRefs.current[index] = el;
          }}
          className={cn(
            'max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-semibold leading-none tracking-tight opacity-0 transition-[max-width,opacity] duration-300',
            isActive && 'max-w-[5.5rem] opacity-100',
            isPrimary && 'sr-only'
          )}
        >
          {item.label}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-1.5 h-0.5 rounded-full bg-foreground transition-[width,opacity] duration-300',
            isActive && !isPrimary ? 'opacity-100' : 'opacity-0'
          )}
          style={{ width: 'var(--line-width)' }}
        />
      </button>
    );
  };

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] md:hidden',
        className
      )}
    >
      <div className="mx-auto grid h-16 max-w-[25rem] grid-cols-[1fr_auto_1fr] items-center gap-1 rounded-[1.65rem] border border-border/80 bg-card/95 px-2 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-1">
          {finalItems.slice(0, 2).map((item, index) => renderMenuButton(item, index))}
        </div>
        {finalItems[2] ? renderMenuButton(finalItems[2], 2) : null}
        <div className="flex min-w-0 items-center gap-1">
          {finalItems.slice(3).map((item, relativeIndex) => renderMenuButton(item, relativeIndex + 3))}
        </div>
      </div>
    </nav>
  );
}
