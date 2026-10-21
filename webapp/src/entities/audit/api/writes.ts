import { useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user/model/store';
import { applyCandidateChange, applyGoalAnswer } from '../model/applyChange';
import type { Audit, CandidateChange, Goal, Goals, SubscriptionAnswer } from '../model/types';
import { auditKeys } from './keys';

/** A press on a candidate, «Готово», or an answer about a subscription's goal. */
type AuditWrite =
  | { kind: 'mark'; auditId: string; candidateId: string; change: CandidateChange }
  | { kind: 'finish'; auditId: string }
  | { kind: 'goal'; goalId: string; answer: SubscriptionAnswer };

/** The server's answer: the whole audit for a mark and «Готово», the goal for an answer. */
type AuditWriteResult = { audit: Audit } | { goal: Goal };

const AUDIT_WRITE = ['audit', 'write'] as const;

const replaceGoal = (goals: readonly Goal[], goal: Goal) => goals.map((entry) => (entry.id === goal.id ? goal : entry));

function applyWrite(audit: Audit, write: AuditWrite): Audit {
  if (write.kind === 'mark') return applyCandidateChange(audit, write.candidateId, write.change);
  if (write.kind === 'goal') {
    const goal = audit.goals.find((entry) => entry.id === write.goalId);
    return goal ? { ...audit, goals: replaceGoal(audit.goals, applyGoalAnswer(goal, write.answer)) } : audit;
  }
  return audit;
}

/** The writes still on their way after `write`, in the order they were made. */
function writesAfter(queryClient: QueryClient, write: AuditWrite): AuditWrite[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: AUDIT_WRITE, status: 'pending' })
    .map((mutation) => mutation.state.variables as AuditWrite | undefined)
    .filter((variables): variables is AuditWrite => !!variables && variables !== write);
}

/**
 * The audit's writes (FT-132). Marks, «Готово» and the answers about a subscription go out one after another, in the
 * order pressed (`PATCH /api/audits/:id/candidates/:candidateId`, `POST /api/audits/:id/finish`, `PATCH /api/goals/:id`):
 * a press shows at once, and the server's answer — the whole audit, or the goal — takes its place with the presses still
 * on their way laid over it, so an earlier answer never undoes a later press. A press that did not reach the server is
 * taken back the same way and `onFailed` says so.
 *
 * Home's «Цели после ревизии» (`GET /api/goals`) is read again once the last write has landed — at once, even with Home
 * closed, so «На главную» opens Home with the card in place. An answer changes a goal Home already has in its list; it
 * never writes the list itself: the list Home read before «Готово» does not have the goals yet.
 */
export function useAuditWrites({ onFailed }: { onFailed?: (error: ApiError, what: AuditWrite['kind']) => void } = {}) {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId) ?? '';
  const key = auditKeys.current(userId);
  const goalsKey = auditKeys.goals(userId);
  // The audit as the server last answered, under the presses still on their way
  const confirmed = useRef<Audit | undefined>(undefined);

  const show = (base: Audit | undefined, pending: AuditWrite[]) => {
    if (base) queryClient.setQueryData<Audit>(key, pending.reduce(applyWrite, base));
  };
  const afterLast = () => {
    if (queryClient.isMutating({ mutationKey: AUDIT_WRITE }) > 1) return;
    // The goals come with «Готово»: from then on they are read at once, with Home closed too; before it, when next shown
    const done = queryClient.getQueryData<Audit>(key)?.state === 'done';
    void queryClient.invalidateQueries({ queryKey: goalsKey, refetchType: done ? 'all' : 'active' });
  };

  const write = useMutation<AuditWriteResult, ApiError, AuditWrite>({
    mutationKey: AUDIT_WRITE,
    scope: { id: 'audit' },
    mutationFn: async (variables) => {
      if (variables.kind === 'goal') {
        const response = await apiClient.patch<Goal>(API_ENDPOINTS.GOALS.UPDATE(variables.goalId), { subscription: variables.answer });
        return { goal: response.data };
      }
      const response =
        variables.kind === 'mark'
          ? await apiClient.patch<Audit>(API_ENDPOINTS.AUDITS.CANDIDATE(variables.auditId, variables.candidateId), variables.change)
          : await apiClient.post<Audit>(API_ENDPOINTS.AUDITS.FINISH(variables.auditId));
      return { audit: response.data };
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      // The first press of a run starts from what the screen shows: the server's last answer
      if (writesAfter(queryClient, variables).length === 0) confirmed.current = queryClient.getQueryData<Audit>(key);
      if (variables.kind !== 'finish') queryClient.setQueryData<Audit>(key, (audit) => (audit ? applyWrite(audit, variables) : audit));
    },
    onSuccess: (result, variables) => {
      if ('goal' in result) {
        const { goal } = result;
        if (confirmed.current) confirmed.current = { ...confirmed.current, goals: replaceGoal(confirmed.current.goals, goal) };
        const goals = queryClient.getQueryData<Goals>(goalsKey);
        if (goals?.goals.some((entry) => entry.id === goal.id)) queryClient.setQueryData<Goals>(goalsKey, { ...goals, goals: replaceGoal(goals.goals, goal) });
      } else {
        confirmed.current = result.audit;
      }
      show(confirmed.current, writesAfter(queryClient, variables));
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

  return {
    /** «Нужно / Лишнее» (null — the second press) or «Вдвое меньше / Отказаться». */
    mark: (auditId: string, candidateId: string, change: CandidateChange) => write.mutate({ kind: 'mark', auditId, candidateId, change }),
    /** «Готово»: resolves once every press before it and «Готово» itself have landed; rejects when it did not. */
    finish: async (auditId: string): Promise<void> => {
      await write.mutateAsync({ kind: 'finish', auditId });
    },
    /** «Уже отменено», «Напомнить» or no answer about a subscription to cancel. */
    answerGoal: (goalId: string, answer: SubscriptionAnswer) => write.mutate({ kind: 'goal', goalId, answer }),
  };
}
