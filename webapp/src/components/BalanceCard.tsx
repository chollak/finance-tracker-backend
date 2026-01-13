import { Card } from '../design-system/components';

interface BalanceCardProps {
  balance: number;
  expenseChange: number;
}

export const BalanceCard = ({ balance, expenseChange }: BalanceCardProps) => {
  const isPositive = expenseChange >= 0;

  // Dynamic font sizing based on balance magnitude
  const getFontSizeClass = (balance: number): string => {
    const formattedLength = Math.abs(balance).toLocaleString('en-US').length;

    if (formattedLength <= 6) {
      // Small numbers (e.g., $1,234): Keep large size
      return 'text-5xl md:text-6xl';
    } else if (formattedLength <= 10) {
      // Medium numbers (e.g., $1,234,567): Use medium size
      return 'text-3xl md:text-4xl';
    } else {
      // Large numbers (e.g., $1,234,567,890): Use small size
      return 'text-2xl md:text-3xl';
    }
  };

  return (
    <Card variant="dark" rounded="4xl" padding="lg" className="relative overflow-hidden">
      {/* Trend Icon */}
      <div className="absolute top-6 right-6 w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m3 17 6-6 4 4 8-8"/>
          <path d="M17 7h4v4"/>
        </svg>
      </div>

      <p className="text-sm text-white/70 mb-3">My Balance</p>
      <p className={`${getFontSizeClass(balance)} font-bold mb-4 break-all overflow-hidden`}>
        ${balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        <span className="text-white/50">.{(balance % 1).toFixed(2).substring(2)}</span>
      </p>
      <p className="text-sm text-white/70">
        Expenses this month have {isPositive ? 'increased' : 'decreased'}{' '}
        <span className="text-white font-semibold">{Math.abs(expenseChange)}%</span>
      </p>
    </Card>
  );
};
