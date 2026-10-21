import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * The end of a list read a page at a time (History FT-116, the account screen FT-118): reads the next page once it
 * comes near the screen. Without IntersectionObserver a button reads it.
 */
export function NextPage({ onLoad }: { onLoad: () => void }) {
  const marker = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  useEffect(() => {
    load.current = onLoad;
  });
  const [watching] = useState(() => typeof IntersectionObserver !== 'undefined');

  useEffect(() => {
    const node = marker.current;
    if (!node || !watching) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load.current();
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [watching]);

  if (!watching) {
    return (
      <button
        type="button"
        onClick={onLoad}
        className={cn('h-touch self-center rounded-pill px-4 text-[14px] font-extrabold text-ink', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink')}
      >
        Показать ещё
      </button>
    );
  }
  return <div ref={marker} aria-hidden="true" className="h-px" />;
}
