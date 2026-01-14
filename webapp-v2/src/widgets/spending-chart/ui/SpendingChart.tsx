import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCategoryBreakdown } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
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

  // Transform data for recharts
  const chartData = categories.map((cat, index) => ({
    name: cat.category,
    value: cat.total,
    percentage: cat.percentage,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Расходы по категориям</CardTitle>
        <CardDescription>Распределение расходов за период</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry: any) => `${entry.name} (${entry.percentage.toFixed(1)}%)`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number | undefined) =>
                value !== undefined
                  ? new Intl.NumberFormat('ru-RU', {
                      style: 'currency',
                      currency: 'UZS',
                      minimumFractionDigits: 0,
                    }).format(value)
                  : ''
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>

        {/* Category List */}
        <div className="mt-4 space-y-2">
          {categories.slice(0, 5).map((cat, index) => {
            const icon = getCategoryIcon(cat.category);

            return (
              <div key={cat.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full`} style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span>{icon}</span>
                  <span>{cat.category}</span>
                </div>
                <span className="font-medium">
                  {new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'UZS',
                    minimumFractionDigits: 0,
                  }).format(cat.total)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
