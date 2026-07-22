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
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      {/* Mobile Navigation */}
      <BottomNav />
    </div>
  );
}
