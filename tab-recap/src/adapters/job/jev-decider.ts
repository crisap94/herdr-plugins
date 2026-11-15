import { type Decider, type DecidedResult, type Noul } from '#src/ports/decider.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, parseMilliseconds } from '#src/recap/domain/time.ts';
import { obj } from '../transcripts/jsonl.ts';

export const JEV_TIMEOUT_MS = 10_000;
const USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export interface JevOptions {
    readonly url: string;
    readonly model: string;
    readonly key: () => string | null;
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
}

const NO_KEY = 'a TypeSafe API key (TAB_RECAP_JEV_KEY, TYPESAFE_API_KEY or ~/.config/typesafe-api-key)';

export class JevDecider implements Decider {
    readonly label: Text;
    private readonly options: JevOptions;

    constructor(options: JevOptions) {
        this.options = options;
        this.label = must(parseText(`jev · ${options.model}`));
    }

    async ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedResult> {
        const key = this.options.key();
        if (key === null) return unknown({ why: 'not-found', what: NO_KEY });
        const now = this.options.now ?? Date.now;
        const began = now();
        const wire = Object.fromEntries([...questions].map(([id, noul]) => [id, { type: 'noul', ...noul }]));
        const sent = await this.post(key, `{"model":${JSON.stringify(this.options.model)},"state":${state},"questions":${JSON.stringify(wire)}}`);
        if (sent.kind === 'unknown') return sent;
        return answered(sent.body, [...questions.keys()], { model: this.options.model, tookMs: now() - began });
    }

    private async post(key: string, body: string): Promise<{ kind: 'body'; body: unknown } | ReturnType<typeof unknown>> {
        let response: Response;
        try {
            response = await (this.options.fetch ?? fetch)(this.options.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(JEV_TIMEOUT_MS) });
        } catch (error) {
            return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
                ? unknown({ why: 'timeout', after: duration(JEV_TIMEOUT_MS) })
                : unknown({ why: 'unreachable', detail: causeOf(must(parseText(`the decider did not answer (${error instanceof Error ? error.name : 'error'})`))) });
        }
        if (!response.ok) return unknown({ why: 'failed', code: response.status, detail: causeOf(must(parseText(failure(response.status)))) });
        try {
            return { kind: 'body', body: await response.json() };
        } catch {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText('the decider answered with something that is not JSON'))) });
        }
    }
}

function failure(status: number): string {
    if (status === 401 || status === 403) return 'refused: the key was not accepted';
    if (status === 429 || status === 529) return 'busy: try again later';
    return `HTTP ${status}`;
}

function answered(body: unknown, ids: readonly Text[], meta: { model: string; tookMs: number }): DecidedResult {
    const [reply, answers] = [obj(body), new Map<Text, Probability>()];
    for (const id of ids) {
        const noul = obj(obj(reply['answers'])[id])['noul'];
        const probability = typeof noul === 'number' ? parseProbability(noul) : null;
        if (probability === null) return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`no usable answer for ${id}`))) });
        answers.set(id, probability);
    }
    const used = obj(reply['usage'])['input_tokens'];
    const tokens = must(parseCount(typeof used === 'number' && Number.isSafeInteger(used) && used >= 0 ? used : 0));
    return { kind: 'decided', answers, tokens, costUsd: must(parseUsd(tokens * USD_PER_INPUT_TOKEN)), tookMs: must(parseMilliseconds(Math.max(0, meta.tookMs))), model: must(parseText(typeof reply['model'] === 'string' ? reply['model'] : meta.model)) };
}
