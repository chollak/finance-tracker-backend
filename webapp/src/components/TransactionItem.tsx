import { Transaction } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, ShoppingBag, Utensils, Car, Film, Lightbulb, Briefcase, DollarSign, Heart, GraduationCap, Plane, Gift, Wallet } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

const categoryIcons: Record<string, LucideIcon> = {
  'Shopping': ShoppingBag,
  'Food & Drink': Utensils,
  'Food': Utensils,
  'Transport': Car,
  'Entertainment': Film,
  'Bills': Lightbulb,
  'Utilities': Lightbulb,
  'Freelance': Briefcase,
  'Salary': DollarSign,
  'Health': Heart,
  'Education': GraduationCap,
  'Travel': Plane,
  'Gifts': Gift,
  'Other': Wallet,
};

export const TransactionItem = ({ transaction, onEdit, onDelete }: TransactionItemProps) => {
  const Icon = categoryIcons[transaction.category] || Wallet;
  const amountPrefix = transaction.type === 'income' ? '+' : '-';
  const amountColor = transaction.type === 'income' ? 'text-green-income' : 'text-red-expense';
  const iconBg = transaction.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';

  return (
    <Card className="flex items-center gap-3 p-4 hover:shadow-md transition-all duration-200 group">
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(transaction);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive"
          title="Delete transaction"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      <div
        className="flex items-center gap-3 flex-1 cursor-pointer"
        onClick={() => onEdit?.(transaction)}
      >
        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-6 w-6" />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate max-w-full md:max-w-2xl">{transaction.description}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{transaction.category}</Badge>
            <span>{new Date(transaction.date).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Amount */}
        <div className={`font-bold text-lg ${amountColor} whitespace-nowrap`}>
          {amountPrefix}${transaction.amount.toFixed(2)}
        </div>
      </div>
    </Card>
  );
};
