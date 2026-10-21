import type { Query, QueryClient } from '@tanstack/react-query';

/** The reads on screen that have no answer yet: still on their way, or failed. */
const unanswered = { type: 'active', predicate: (query: Query) => query.state.data === undefined } as const;

/**
 * «Попробовать снова» of the slow skeleton (FT-112): asks again for every read on screen that has not
 * answered — the settings, the balances, the month, the records. A plain refetch of a read with no data
 * would wait for the request already on its way, which on a weak connection may hang; so that request is
 * dropped first and a new one is made.
 *
 * It cannot hurry Home's code (the lazy `import('@/pages')`): a dynamic import on its way cannot be dropped,
 * and importing the same module again only waits for the same request, since the browser keeps one per
 * module. While the code is the slow step, the button gives six more seconds and nothing else; a failed
 * import goes to the router's error screen, not to the skeleton.
 */
export async function retryUnanswered(client: QueryClient): Promise<void> {
  await client.cancelQueries(unanswered);
  await client.refetchQueries(unanswered);
}
