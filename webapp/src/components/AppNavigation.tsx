import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, BarChart3, CreditCard, Target, TrendingUp, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface AppNavigationProps {
  userId?: string;
}

const routes = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { path: '/transactions', icon: CreditCard, label: 'Transactions' },
  { path: '/budgets', icon: Target, label: 'Budgets' },
  { path: '/stats', icon: TrendingUp, label: 'Analytics' },
];

export default function AppNavigation({ userId }: AppNavigationProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const query = userId ? `?userId=${userId}` : '';

  const isActive = (path: string) => location.pathname === path;

  // Desktop Navigation
  const DesktopNav = () => (
    <nav className="hidden md:flex items-center gap-1 mb-6 pb-4 border-b">
      {routes.map((route) => {
        const Icon = route.icon;
        const active = isActive(route.path);

        return (
          <Button
            key={route.path}
            asChild
            variant={active ? 'default' : 'ghost'}
            size="sm"
          >
            <Link to={`${route.path}${query}`}>
              <Icon className="h-4 w-4 mr-2" />
              {route.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );

  // Mobile Navigation
  const MobileNav = () => (
    <div className="md:hidden flex items-center justify-between mb-4">
      <h1 className="text-xl font-bold">FinTrack</h1>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <div className="flex flex-col gap-4 mt-8">
            <h2 className="text-lg font-semibold px-2">Navigation</h2>
            <Separator />
            <nav className="flex flex-col gap-2">
              {routes.map((route) => {
                const Icon = route.icon;
                const active = isActive(route.path);

                return (
                  <Button
                    key={route.path}
                    asChild
                    variant={active ? 'default' : 'ghost'}
                    className="justify-start"
                    onClick={() => setOpen(false)}
                  >
                    <Link to={`${route.path}${query}`}>
                      <Icon className="h-5 w-5 mr-3" />
                      {route.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
