export const accountKeys = {
  all: ['accounts'] as const,
  list: (userId: string) => [...accountKeys.all, 'list', userId] as const,
};
