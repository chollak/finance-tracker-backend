import { Transaction } from '../types';

export function groupTransactionsByDate(transactions: Transaction[]) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const isThisWeek = (date: Date) => {
    const now = new Date();
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
    weekStart.setHours(0, 0, 0, 0);
    return date >= weekStart;
  };

  const grouped: Record<string, Transaction[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': []
  };

  transactions.forEach(t => {
    const tDate = new Date(t.date).toDateString();

    if (tDate === today) {
      grouped['Today'].push(t);
    } else if (tDate === yesterday) {
      grouped['Yesterday'].push(t);
    } else if (isThisWeek(new Date(t.date))) {
      grouped['This Week'].push(t);
    } else {
      grouped['Earlier'].push(t);
    }
  });

  return grouped;
}
