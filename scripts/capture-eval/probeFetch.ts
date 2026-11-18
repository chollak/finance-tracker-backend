import { CAPTURE_ANSWER_FORMAT } from './answerSchema';

/** How the request to the model is changed for a trial; nothing changed when empty. */
export interface RequestTrial {
  temperature?: number;
  /** The strict JSON schema of the answer instead of `json_object`. */
  schema?: boolean;
}

type Fetch = typeof globalThis.fetch;

/** What one capture asked the model and got: for the report, never printed with a key — a request's headers stay here. */
export interface Probe {
  fetch: Fetch;
  /** Requests sent. Zero: a text fast path read the phrase. */
  calls: number;
  /** The content of the last answer, as the model wrote it. */
  answer?: string;
  /** The model did not answer: an HTTP status that is no 2xx, or the request never got through. */
  failure?: string;
}

/**
 * A `fetch` for one capture, given to `OpenAITranscriptionService`: sends the request as the service built it — or
 * with the trial's `temperature` and answer schema in its body — and keeps what came back. The service's own code is
 * not touched, so a trial is the production request plus exactly the parameters named.
 */
export function probeFetch(trial: RequestTrial = {}, send: Fetch = globalThis.fetch): Probe {
  const probe: Probe = {
    calls: 0,
    fetch: async (input, init) => {
      probe.calls += 1;
      try {
        const response = await send(input, { ...init, body: trialBody(init?.body, trial) });
        if (!response.ok) {
          probe.failure = `HTTP ${response.status}`;
          return response;
        }
        const body = await response.clone().json() as { choices?: Array<{ message?: { content?: string } }> };
        probe.answer = body.choices?.[0]?.message?.content ?? undefined;
        probe.failure = undefined;
        return response;
      } catch (error) {
        probe.failure = `нет соединения${error instanceof Error ? `, ${error.name}` : ''}`;
        throw error;
      }
    },
  };
  return probe;
}

function trialBody(body: BodyInit | null | undefined, trial: RequestTrial): BodyInit | null | undefined {
  if (typeof body !== 'string' || (trial.temperature === undefined && !trial.schema)) return body;
  const request = JSON.parse(body);
  return JSON.stringify({
    ...request,
    ...(trial.temperature === undefined ? {} : { temperature: trial.temperature }),
    ...(trial.schema ? { response_format: CAPTURE_ANSWER_FORMAT } : {}),
  });
}
