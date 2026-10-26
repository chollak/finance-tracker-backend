// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user/model/store';
import { apiClient } from '@/shared/api';
import { applyCandidateChange, applyGoalAnswer } from '../model/applyChange';
import { BOARD_DONE, BOARD_GOALS, BOARD_OPEN } from '../model/fixtures';
import type { Audit, CandidateChange, Goal, Goals, SubscriptionAnswer } from '../model/types';
import { auditKeys } from './keys';
import { useGoals } from './queries';
import { useAuditWrites } from './writes';

/**
 * FT-132, the audit's write queue: marks, «Готово» and the answers about a subscription go out one at a time in the
 * order pressed; each press shows at once, the server's answer takes its place with the presses still on their way laid
 * over it, and a press that failed is taken back while the later ones stay. Home's goals are read again after the last
 * write, even with Home closed. The PATCHes here are answered by the test, one at a time.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const NO_GOALS: Goals = { today: '2026-10-14', startsOn: null, endsOn: null, goals: [], planMinor: 0, comparison: null };

interface Sent {
  url: string;
  body: unknown;
  answer: (data: unknown) => void;
  fail: () => void;
}

/** The PATCHes sent and not answered yet, oldest first. */
let sent: Sent[];
let goalsOnServer: Goals;
let failed: string[];
let client: QueryClient;
let writes: WritesHook;
let root: Root;
let container: HTMLDivElement;

type WritesHook = ReturnType<typeof useAuditWrites>;

function Probe({ onRender }: { onRender: (hook: WritesHook) => void }) {
  onRender(useAuditWrites({ onFailed: (_error, what) => failed.push(what) }));
  return null;
}

/** Home's read of the goals; Home is then closed while the audit is open. */
function HomeGoals() {
  useGoals();
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sent = [];
  failed = [];
  goalsOnServer = BOARD_GOALS;
  vi.mocked(apiClient.patch).mockReset().mockImplementation(
    (url: string, body: unknown) =>
      new Promise((resolve, reject) => {
        sent.push({ url, body, answer: (data) => resolve({ success: true, data } as never), fail: () => reject({ message: 'Network error', statusCode: 0 }) });
      }) as never
  );
  vi.mocked(apiClient.get).mockReset().mockImplementation(async (url: string) => {
    if (url === '/goals') return { success: true, data: goalsOnServer } as never;
    return new Promise<never>(() => {});
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур', username: null, signedOut: false });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Home reads the goals as the server has them now, and closes. */
async function homeRead(goals: Goals) {
  goalsOnServer = goals;
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <HomeGoals />
      </QueryClientProvider>
    );
  });
  await settle();
  expect(client.getQueryData(auditKeys.goals(USER_ID))).toEqual(goals);
}

/** The audit screen with `audit` shown; Home is closed. */
async function start(audit: Audit) {
  client.setQueryData(auditKeys.current(USER_ID), audit);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe onRender={(hook) => (writes = hook)} />
      </QueryClientProvider>
    );
  });
}

const shown = () => client.getQueryData<Audit>(auditKeys.current(USER_ID))!;
const decisionOf = (audit: Audit, id: string) => audit.candidates.find((candidate) => candidate.id === id)?.decision;
const answerOf = (audit: Audit, id: string) => audit.goals.find((goal) => goal.id === id)?.subscription?.state;
const markOn = (audit: Audit, id: string, change: CandidateChange) => applyCandidateChange(audit, id, change);
const goalWith = (id: string, answer: SubscriptionAnswer): Goal => applyGoalAnswer(BOARD_DONE.goals.find((goal) => goal.id === id)!, answer);

async function press(action: () => unknown) {
  await act(async () => {
    void action();
  });
  await settle();
}

async function answerOldest(data: unknown) {
  await act(async () => sent.shift()!.answer(data));
  await settle();
}

async function failOldest() {
  await act(async () => sent.shift()!.fail());
  await settle();
}

describe('marks on their way', () => {
  it('go out one at a time; the answer to the first lies under the second, which still shows', async () => {
    await start(BOARD_OPEN);

    await press(() => writes.mark('audit-sep', 'coffee', { decision: 'extra' }));
    await press(() => writes.mark('audit-sep', 'taxi', { decision: 'extra' }));

    expect(sent.map((call) => call.url)).toEqual(['/audits/audit-sep/candidates/coffee']);
    expect(decisionOf(shown(), 'coffee')).toBe('extra');
    expect(decisionOf(shown(), 'taxi')).toBe('extra');

    // The server's audit after the first mark does not know the second yet
    const afterCoffee = markOn(BOARD_OPEN, 'coffee', { decision: 'extra' });
    await answerOldest(afterCoffee);

    expect(decisionOf(shown(), 'coffee')).toBe('extra');
    expect(decisionOf(shown(), 'taxi')).toBe('extra');
    expect(shown().summary.marked).toBe(2);
    expect(sent.map((call) => call.url)).toEqual(['/audits/audit-sep/candidates/taxi']);

    const afterTaxi = markOn(afterCoffee, 'taxi', { decision: 'extra' });
    await answerOldest(afterTaxi);

    expect(shown()).toEqual(afterTaxi);
  });

  it('a mark that failed is taken back while a later one stays; then the screen is the server’s', async () => {
    await start(BOARD_OPEN);

    await press(() => writes.mark('audit-sep', 'coffee', { decision: 'extra' }));
    await press(() => writes.mark('audit-sep', 'taxi', { decision: 'need' }));
    await failOldest();

    expect(failed).toEqual(['mark']);
    expect(decisionOf(shown(), 'coffee')).toBeNull();
    expect(decisionOf(shown(), 'taxi')).toBe('need');
    expect(shown().summary.marked).toBe(1);

    const afterTaxi = markOn(BOARD_OPEN, 'taxi', { decision: 'need' });
    await answerOldest(afterTaxi);

    expect(shown()).toEqual(afterTaxi);
  });
});

describe('answers about a subscription', () => {
  it('go out in press order, so the later answer is the one kept', async () => {
    await start(BOARD_DONE);

    await press(() => writes.answerGoal('goal-kinopoisk', 'remind'));
    await press(() => writes.answerGoal('goal-kinopoisk', 'cancelled'));

    expect(sent.map((call) => call.body)).toEqual([{ subscription: 'remind' }]);
    expect(answerOf(shown(), 'goal-kinopoisk')).toBe('cancelled');

    await answerOldest(goalWith('goal-kinopoisk', 'remind'));
    expect(answerOf(shown(), 'goal-kinopoisk')).toBe('cancelled');
    expect(sent.map((call) => call.body)).toEqual([{ subscription: 'cancelled' }]);

    await answerOldest(goalWith('goal-kinopoisk', 'cancelled'));
    expect(answerOf(shown(), 'goal-kinopoisk')).toBe('cancelled');
  });

  it('an answer that failed is taken back', async () => {
    await start(BOARD_DONE);

    await press(() => writes.answerGoal('goal-kinopoisk', 'remind'));
    await failOldest();

    expect(failed).toEqual(['goal']);
    expect(answerOf(shown(), 'goal-kinopoisk')).toBeNull();
  });
});

describe('Home’s «Цели после ревизии»', () => {
  it('an answer does not fill the list Home read before «Готово»; the goals are read again with Home closed', async () => {
    // Home read the goals while the audit was open: none yet
    await homeRead(NO_GOALS);
    await start(BOARD_DONE);
    goalsOnServer = BOARD_GOALS;
    vi.mocked(apiClient.get).mockClear();

    await press(() => writes.answerGoal('goal-kinopoisk', 'remind'));
    await answerOldest(goalWith('goal-kinopoisk', 'remind'));

    expect(apiClient.get).toHaveBeenCalledWith('/goals');
    expect(client.getQueryData<Goals>(auditKeys.goals(USER_ID))).toEqual(BOARD_GOALS);
  });

  it('an answer changes the goal in a list that has it', async () => {
    await homeRead(BOARD_GOALS);
    await start(BOARD_DONE);
    vi.mocked(apiClient.get).mockImplementation(() => new Promise<never>(() => {}));

    await press(() => writes.answerGoal('goal-kinopoisk', 'remind'));
    await answerOldest(goalWith('goal-kinopoisk', 'remind'));

    const kinopoisk = client.getQueryData<Goals>(auditKeys.goals(USER_ID))!.goals.find((goal) => goal.id === 'goal-kinopoisk');
    expect(kinopoisk?.subscription?.state).toBe('remind');
  });

  it('marks before «Готово» leave them for Home to read when it opens: the goals come with «Готово»', async () => {
    await homeRead(NO_GOALS);
    await start(BOARD_OPEN);
    vi.mocked(apiClient.get).mockClear();

    await press(() => writes.mark('audit-sep', 'coffee', { decision: 'extra' }));
    await answerOldest(markOn(BOARD_OPEN, 'coffee', { decision: 'extra' }));

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(client.getQueryState(auditKeys.goals(USER_ID))?.isInvalidated).toBe(true);
  });

  it('«Готово» reads them again at once, before Home opens', async () => {
    await homeRead(NO_GOALS);
    await start(BOARD_OPEN);
    goalsOnServer = BOARD_GOALS;
    vi.mocked(apiClient.get).mockClear();
    vi.mocked(apiClient.post).mockImplementation(async () => ({ success: true, data: BOARD_DONE }) as never);

    await press(() => writes.finish('audit-sep'));

    expect(apiClient.get).toHaveBeenCalledWith('/goals');
    expect(client.getQueryData<Goals>(auditKeys.goals(USER_ID))).toEqual(BOARD_GOALS);
  });
});
