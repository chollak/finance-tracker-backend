import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { EmptyState } from '@/shared/ui';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/ui/chart';
import { useCategoryBreakdown } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { PieChart, Pie, Cell } from 'recharts';
import { getCategoryIcon, getCategoryName } from '@/entities/category';
import { getCategoryColorByIndex } from '@/shared/lib/design-tokens';
import { useMemo } from 'react';

/**
 * Format large numbers compactly (e.g., 1.4M, 500K)
 */
function formatCompactAmount(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`;
  }
  return amount.toFixed(0);
}

/**
 * Spending chart widget
 * Shows pie chart of spending by category using shadcn Chart components
 */
export function SpendingChart() {
  const userId = useUserStore((state) => state.userId);
  const { data: categories, isLoading } = useCategoryBreakdown(userId);

  // Build dynamic chart config based on categories
  const chartConfig = useMemo<ChartConfig>(() => {
    if (!categories) return {};

    return categories.reduce((config, cat, index) => {
      config[cat.category] = {
        label: getCategoryName(cat.category),
        color: getCategoryColorByIndex(index),
      };
      return config;
    }, {} as ChartConfig);
  }, [categories]);

  // Transform data for recharts with minimum visual size
  const chartData = useMemo(() => {
    if (!categories) return [];

    const MIN_VISUAL_PERCENT = 5;
    const totalValue = categories.reduce((sum, cat) => sum + cat.total, 0);

    return categories.map((cat, index) => {
      const actualPercent = cat.percentage;
      const visualPercent = Math.max(actualPercent, MIN_VISUAL_PERCENT);
      const visualValue = (visualPercent / 100) * totalValue;

      return {
        name: getCategoryName(cat.category),
        value: visualValue,
        actualValue: cat.total,
        percentage: actualPercent,
        fill: getCategoryColorByIndex(index),
      };
    });
  }, [categories]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Расходы по категориям</CardTitle>
          <CardDescription>Распределение расходов за период</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Расходы по категориям</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon="📊"
            title="Нет данных для графика"
            description="Добавьте транзакции с расходами, чтобы увидеть распределение"
            tip="График покажет, какие категории расходов занимают больше всего"
            size="sm"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Расходы по категориям</CardTitle>
        <CardDescription>Распределение расходов за период</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Pie Chart */}
          <div className="w-full md:w-auto flex-shrink-0 flex justify-center">
            <ChartContainer config={chartConfig} className="w-[180px] h-[180px]">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(_value, _name, item) => {
                        const data = item.payload;
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{data.name}</span>
                            <span className="text-muted-foreground">
                              {new Intl.NumberFormat('ru-RU', {
                                style: 'currency',
                                currency: 'UZS',
                                minimumFractionDigits: 0,
                              }).format(data.actualValue)}
                            </span>
                            <span className="font-medium" style={{ color: data.fill }}>
                              {data.percentage.toFixed(1)}%
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={1}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          {/* Category List - Grid Layout */}
          <div className="w-full flex-1 min-w-0">
            <div className="grid gap-2">
              {categories.slice(0, 5).map((cat, index) => {
                const icon = getCategoryIcon(cat.category);
                const color = getCategoryColorByIndex(index);

                return (
                  <div
                    key={cat.category}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Color indicator */}
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />

                    {/* Icon */}
                    <span className="text-base flex-shrink-0">{icon}</span>

                    {/* Category name with percentage */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{getCategoryName(cat.category)}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>

                    {/* Amount - compact format */}
                    <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                      {formatCompactAmount(cat.total)} UZS
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Show more indicator if there are more categories */}
            {categories.length > 5 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                +{categories.length - 5} ещё
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
