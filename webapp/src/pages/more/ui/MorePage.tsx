import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, HandCoins } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { ROUTES } from '@/shared/lib/constants/routes';

const moreItems = [
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

export function MorePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Ещё</h1>
        <p className="mt-1 text-muted-foreground">
          Дополнительные разделы, которые нужны не каждый день
        </p>
      </div>

      <div className="space-y-3">
        {moreItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} to={item.href} className="block">
              <Card className="p-4 transition-colors active:bg-muted/60 hover:bg-muted/40">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success-muted text-success">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold leading-tight">{item.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
