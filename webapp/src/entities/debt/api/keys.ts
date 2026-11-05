// What is left of the debt entity (#265): quick capture still refreshes these keys after a capture that reports a
// debt (`features/quick-capture/api/invalidation.ts`, frozen until #266). No query reads them any more.
export const debtKeys = {
  all: ['debts'] as const,
  lists: () => [...debtKeys.all, 'list'] as const,
  summary: (userId: string) => [...debtKeys.all, 'summary', userId] as const,
};
