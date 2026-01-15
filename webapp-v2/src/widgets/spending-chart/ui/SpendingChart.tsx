import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCategoryBreakdown } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getCategoryIcon } from '@/entities/category';

/**
 * Color palette for pie chart
 */
const COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#FFD93D', // Yellow
  '#6BCF7F', // Green
  '#A78BFA', // Purple
  '#F97316', // Orange
  '#EC4899', // Pink
  '#3B82F6', // Blue
];

/**
 * Spending chart widget
 * Shows pie chart of spending by category
 */
export function SpendingChart() {
  const userId = useUserStore((state) => state.userId);
  const { data: categories, isLoading } = useCategoryBreakdown(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Расходы по категориям</CardTitle>
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
          <CardDescription>Нет данных для отображения</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Добавьте транзакции, чтобы увидеть распределение расходов
          </p>
        </CardContent>
      </Card>
    );
  }

  // Transform data for recharts with minimum visual size
  // Small categories get a minimum visual percentage (5%) to be visible
  const MIN_VISUAL_PERCENT = 5;
  const totalValue = categories.reduce((sum, cat) => sum + cat.total, 0);

  const chartData = categories.map((cat, index) => {
    // Calculate visual value - ensure minimum visibility
    const actualPercent = cat.percentage;
    const visualPercent = Math.max(actualPercent, MIN_VISUAL_PERCENT);
    const visualValue = (visualPercent / 100) * totalValue;

    return {
      name: cat.category,
      value: visualValue, // Used for chart sizing
      actualValue: cat.total, // Real value for tooltip
      percentage: actualPercent, // Real percentage for tooltip
      color: COLORS[index % COLORS.length],
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Расходы по категориям</CardTitle>
        <CardDescription>Распределение расходов за период</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-4">
          {/* Pie Chart */}
          <div className="w-full lg:w-1/2">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={0}
                  fill="#8884d8"
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-medium">{data.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Intl.NumberFormat('ru-RU', {
                              style: 'currency',
                              currency: 'UZS',
                              minimumFractionDigits: 0,
                            }).format(data.actualValue)}
                          </p>
                          <p className="text-sm font-medium" style={{ color: data.color }}>
                            {data.percentage.toFixed(1)}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category List */}
          <div className="w-full lg:w-1/2 space-y-3">
            {categories.slice(0, 5).map((cat, index) => {
              const icon = getCategoryIcon(cat.category);
              const color = COLORS[index % COLORS.length];

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
