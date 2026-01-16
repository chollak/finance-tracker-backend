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
import { useUserStore } from '@/entities/user';
import { PieChart, Pie, Cell } from 'recharts';
import { getCategoryIcon } from '@/entities/category';
import { useMemo } from 'react';

/**
 * Color palette for pie chart (using CSS HSL values for shadcn compatibility)
 */
const CHART_COLORS = [
  'hsl(0 84% 60%)',      // Red
  'hsl(174 62% 47%)',    // Teal
  'hsl(48 96% 61%)',     // Yellow
  'hsl(134 50% 50%)',    // Green
  'hsl(263 70% 76%)',    // Purple
  'hsl(25 95% 53%)',     // Orange
  'hsl(330 81% 60%)',    // Pink
  'hsl(217 91% 60%)',    // Blue
];

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
        label: cat.category,
        color: CHART_COLORS[index % CHART_COLORS.length],
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
        name: cat.category,
        value: visualValue,
        actualValue: cat.total,
        percentage: actualPercent,
        fill: CHART_COLORS[index % CHART_COLORS.length],
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
      <CardHeader>
        <CardTitle>Расходы по категориям</CardTitle>
        <CardDescription>Распределение расходов за период</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-4">
          {/* Pie Chart */}
          <ChartContainer config={chartConfig} className="w-full lg:w-1/2 aspect-square max-h-[220px]">
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
                innerRadius={50}
                outerRadius={90}
                paddingAngle={0}
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

          {/* Category List */}
          <div className="w-full lg:w-1/2 space-y-3">
            {categories.slice(0, 5).map((cat, index) => {
              const icon = getCategoryIcon(cat.category);
              const color = CHART_COLORS[index % CHART_COLORS.length];

              return (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-lg">{icon}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{cat.category}</span>
                      <span className="text-xs text-muted-foreground">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <span className="font-semibold text-sm">
                    {new Intl.NumberFormat('ru-RU', {
                      style: 'currency',
                      currency: 'UZS',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(cat.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
