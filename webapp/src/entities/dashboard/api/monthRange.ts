export interface DashboardMonthRange {
  startDate: string;
  endDate: string;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getCurrentMonthDashboardRange(now = new Date()): DashboardMonthRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end),
  };
}
