// The decider that asks TypeSafe's System One (Jev): one POST, one probability per question. The key never leaves `post`.
import type { Decider, DecidedResult, Noul } from '#src/ports/decider.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { obj } from './jsonl.ts';

/** The most a call may take. */
export const JEV_TIMEOUT_MS = 10_000;
/** Dollars per input token (output is free). */
const USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export interface JevOptions {
    readonly url: string;
    readonly model: string;
    /** read at call time: null when there is no key */
    readonly key: () => string | null;
    /** the global `fetch` unless a test gives one */
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
}

const NO_KEY = 'a TypeSafe API key (TAB_RECAP_JEV_KEY, TYPESAFE_API_KEY or ~/.config/typesafe-api-key)';

export class JevDecider implements Decider {
    readonly label: string;
    private readonly options: JevOptions;

    constructor(options: JevOptions) {
        this.options = options;
        this.label = `jev · ${options.model}`;
    }

    async ask(state: object, questions: Readonly<Record<string, Noul>>): Promise<DecidedResult> {
        const key = this.options.key();
        if (key === null) return unknown({ why: 'not-found', what: NO_KEY });
        const now = this.options.now ?? Date.now;
        const began = now();
        const sent = await this.post(key, JSON.stringify({ model: this.options.model, state, questions: Object.fromEntries(Object.entries(questions).map(([id, noul]) => [id, { type: 'noul', ...noul }])) }));
        if (sent.kind === 'unknown') return sent;
        return answered(sent.body, Object.keys(questions), { model: this.options.model, tookMs: now() - began });
    }

    /** The only place the key is used. Whatever goes wrong is told without it. */
    private async post(key: string, body: string): Promise<{ kind: 'body'; body: unknown } | ReturnType<typeof unknown>> {
        let response: Response;
        try {
            response = await (this.options.fetch ?? fetch)(this.options.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(JEV_TIMEOUT_MS) });
        } catch (error) {
            return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
                ? unknown({ why: 'timeout', after: duration(JEV_TIMEOUT_MS) })
                : unknown({ why: 'unreachable', detail: `the decider did not answer (${error instanceof Error ? error.name : 'error'})` });
        }
        if (!response.ok) return unknown({ why: 'failed', code: response.status, detail: failure(response.status) });
        try {
            return { kind: 'body', body: await response.json() };
        } catch {
            return unknown({ why: 'unreadable', detail: 'the decider answered with something that is not JSON' });
        }
    }
}

/** What a refusal means, in words the log can carry. */
function failure(status: number): string {
    if (status === 401 || status === 403) return 'refused: the key was not accepted';
    if (status === 429 || status === 529) return 'busy: try again later';
    return `HTTP ${status}`;
}

/** The probabilities of a reply: `answers[id].noul` for every question asked, each in [0, 1]. */
function answered(body: unknown, ids: readonly string[], meta: { model: string; tookMs: number }): DecidedResult {
    const [reply, answers] = [obj(body), {} as Record<string, number>];
    for (const id of ids) {
        const noul = obj(obj(reply['answers'])[id])['noul'];
        if (typeof noul !== 'number' || !Number.isFinite(noul) || noul < 0 || noul > 1) return unknown({ why: 'unreadable', detail: `no usable answer for ${id}` });
        answers[id] = noul;
    }
    const used = obj(reply['usage'])['input_tokens'];
    const tokens = typeof used === 'number' && Number.isFinite(used) && used >= 0 ? used : 0;
    return { kind: 'decided', answers, tokens, costUsd: tokens * USD_PER_INPUT_TOKEN, tookMs: meta.tookMs, model: typeof reply['model'] === 'string' ? reply['model'] : meta.model };
}
