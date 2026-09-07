import type { ReactNode } from 'react';
import { TopNav } from './top-nav';
import { BottomNav } from './bottom-nav';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Main layout wrapper with navigation
 * - TopNav for desktop (hidden on mobile)
 * - BottomNav for mobile (hidden on desktop)
 * - Adds padding-bottom on mobile for BottomNav
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Navigation */}
      <TopNav />

      {/* Main Content */}
      {/*
        Exactly the flush bar's height (a 58px slot row) plus the home-indicator inset. The old
        `5rem` was a guess against a floating dock and left content sliding through the gap
        beneath it; a flush bar reserves precisely what it occupies.
      */}
      <main className="pb-[calc(3.625rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      {/* Mobile Navigation */}
      <BottomNav />
    </div>
  );
}
