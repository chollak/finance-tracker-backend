import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, PageHeader, PageShell, SectionStack } from '@/shared/ui';
import { UsageLimitsCard } from '@/widgets/usage-limits';
import { MORE_DESTINATIONS } from '@/features/more-menu';

/**
 * Desktop and direct-link view of the same sections the mobile bottom
 * navigation opens as a sheet. The list itself lives in one place.
 */
export function MorePage() {
  return (
    <PageShell>
      <PageHeader
        title="Ещё"
        subtitle="Дополнительные разделы, которые нужны не каждый день"
      />

      <SectionStack className="space-y-3">
        {MORE_DESTINATIONS.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} to={item.href} className="block">
              <Card className="p-4 transition-colors active:bg-muted/60 hover:bg-muted/40">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
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

        <UsageLimitsCard />
      </SectionStack>
    </PageShell>
  );
}
