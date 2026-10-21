import { useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import { applyCandidateChange, applyGoalAnswer } from '../model/applyChange';
import type { Audit, CandidateChange, Goal, Goals, SubscriptionAnswer } from '../model/types';
import { auditKeys } from './keys';

/** A press on a candidate or «Готово». */
type AuditWrite = { kind: 'mark'; auditId: string; candidateId: string; change: CandidateChange } | { kind: 'finish'; auditId: string };

const AUDIT_WRITE = ['audit', 'write'] as const;

const applyWrite = (audit: Audit, write: AuditWrite): Audit =>
  write.kind === 'mark' ? applyCandidateChange(audit, write.candidateId, write.change) : audit;

/** The writes still on their way after `write`, in the order they were made. */
function writesAfter(queryClient: QueryClient, write: AuditWrite): AuditWrite[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: AUDIT_WRITE, status: 'pending' })
    .map((mutation) => mutation.state.variables as AuditWrite | undefined)
    .filter((variables): variables is AuditWrite => !!variables && variables !== write);
}

const replaceGoal = (goals: readonly Goal[], goal: Goal) => goals.map((entry) => (entry.id === goal.id ? goal : entry));

/**
 * The audit's writes (FT-132). Marks and «Готово» go out one after another, in the order pressed (`PATCH
 * /api/audits/:id/candidates/:candidateId`, `POST /api/audits/:id/finish`): a mark shows at once, and the server's answer
 * — the whole audit — takes its place with the marks still on their way laid over it, so an earlier answer never undoes
 * a later press. A mark that did not reach the server is taken back the same way and `onFailed` says so. «Уже отменено»
 * and «Напомнить» are saved on the goal (`PATCH /api/goals/:id`). Home's «Цели после ревизии» is read again once the
 * last write has landed.
 */
export function useAuditWrites({ onFailed }: { onFailed?: (error: ApiError, what: 'mark' | 'finish' | 'goal') => void } = {}) {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId) ?? '';
  const key = auditKeys.current(userId);
  // The audit as the server last answered, under the presses still on their way
  const confirmed = useRef<Audit | undefined>(undefined);

  const show = (base: Audit | undefined, pending: AuditWrite[]) => {
    if (base) queryClient.setQueryData<Audit>(key, pending.reduce(applyWrite, base));
  };
  const afterLast = () => {
    if (queryClient.isMutating({ mutationKey: AUDIT_WRITE }) > 1) return;
    void queryClient.invalidateQueries({ queryKey: auditKeys.goals(userId) });
  };

  const write = useMutation<Audit, ApiError, AuditWrite>({
    mutationKey: AUDIT_WRITE,
    scope: { id: 'audit' },
    mutationFn: async (variables) => {
      const response =
        variables.kind === 'mark'
          ? await apiClient.patch<Audit>(API_ENDPOINTS.AUDITS.CANDIDATE(variables.auditId, variables.candidateId), variables.change)
          : await apiClient.post<Audit>(API_ENDPOINTS.AUDITS.FINISH(variables.auditId));
      return response.data;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      // The first press of a run starts from what the screen shows: the server's last answer
      if (writesAfter(queryClient, variables).length === 0) confirmed.current = queryClient.getQueryData<Audit>(key);
      if (variables.kind === 'mark') queryClient.setQueryData<Audit>(key, (audit) => (audit ? applyWrite(audit, variables) : audit));
    },
    onSuccess: (audit, variables) => {
      confirmed.current = audit;
      show(audit, writesAfter(queryClient, variables));
    },
    onError: (error, variables) => {
      const pending = writesAfter(queryClient, variables);
      show(confirmed.current, pending);
      // Nothing else on its way: read what the server has (the month may have turned and closed this audit)
      if (pending.length === 0) void queryClient.invalidateQueries({ queryKey: key });
      onFailed?.(error, variables.kind);
    },
    onSettled: afterLast,
  });

  const answer = useMutation<Goal, ApiError, { goalId: string; answer: SubscriptionAnswer }, { before: Goal | undefined }>({
    mutationFn: async ({ goalId, answer: subscription }) => {
      const response = await apiClient.patch<Goal>(API_ENDPOINTS.GOALS.UPDATE(goalId), { subscription });
      return response.data;
    },
    onMutate: ({ goalId, answer: subscription }) => {
      const before = queryClient.getQueryData<Audit>(key)?.goals.find((goal) => goal.id === goalId);
      if (before) {
        const guess = applyGoalAnswer(before, subscription);
        queryClient.setQueryData<Audit>(key, (audit) => (audit ? { ...audit, goals: replaceGoal(audit.goals, guess) } : audit));
      }
      return { before };
    },
    onSuccess: (goal) => {
      queryClient.setQueryData<Audit>(key, (audit) => (audit ? { ...audit, goals: replaceGoal(audit.goals, goal) } : audit));
      queryClient.setQueryData<Goals>(auditKeys.goals(userId), (goals) => (goals ? { ...goals, goals: replaceGoal(goals.goals, goal) } : goals));
    },
    onError: (error, _variables, context) => {
      const before = context?.before;
      if (before) queryClient.setQueryData<Audit>(key, (audit) => (audit ? { ...audit, goals: replaceGoal(audit.goals, before) } : audit));
      onFailed?.(error, 'goal');
    },
  });

  return {
    /** «Нужно / Лишнее» (null — the second press) or «Вдвое меньше / Отказаться». */
    mark: (auditId: string, candidateId: string, change: CandidateChange) => write.mutate({ kind: 'mark', auditId, candidateId, change }),
    /** «Готово»: resolves with the audit and its goals once every press before it has landed. */
    finish: (auditId: string) => write.mutateAsync({ kind: 'finish', auditId }),
    /** «Уже отменено», «Напомнить» or no answer about a subscription to cancel. */
    answerGoal: (goalId: string, subscription: SubscriptionAnswer) => answer.mutate({ goalId, answer: subscription }),
  };
}
