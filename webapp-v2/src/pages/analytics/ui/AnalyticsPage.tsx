import { SpendingChart } from '@/widgets/spending-chart';
import { FinancialHealth } from '@/widgets/financial-health';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useMonthlyTrends } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/shared/lib/formatters';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Analytics Page
 * Shows spending charts, trends, and financial health
 */
export function AnalyticsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: trends, isLoading: trendsLoading } = useMonthlyTrends(userId, 6);

  return (
    <div className="container mx-auto px-4 py-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(ROUTES.HOME)}
          className="md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Аналитика</h1>
          <p className="text-muted-foreground mt-1">Анализ ваших финансов</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Financial Health */}
        <FinancialHealth />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spending Chart */}
          <SpendingChart />

          {/* Monthly Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Тренды по месяцам</CardTitle>
              <CardDescription>Доходы и расходы за последние 6 месяцев</CardDescription>
            </CardHeader>
            <CardContent>
              {trendsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !trends || trends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Недостаточно данных для отображения трендов
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis
                      tickFormatter={(value) =>
                        new Intl.NumberFormat('ru-RU', {
                          notation: 'compact',
                          compactDisplay: 'short',
                        }).format(value)
                      }
                    />
                    <Tooltip
                      formatter={(value: number | undefined) =>
                        value !== undefined ? formatCurrency(value) : ''
                      }
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#00D68F" name="Доход" />
                    <Bar dataKey="expenses" fill="#FF6B6B" name="Расход" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
