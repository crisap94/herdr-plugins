import { type DeciderPort, type DecidedAnswersResult, type Question } from '#src/ports/decider.ts';
import { isUnknown, unknown, type Unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { JevModel, JevUrl } from '#src/recap/domain/autocompact.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { parseJevReply, type JevReply } from './jev-reply.ts';

export const JEV_TIMEOUT_MS = 10_000;
const USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export interface JevOptions {
    readonly url: JevUrl;
    readonly model: JevModel;
    readonly key: () => Text | null;
    readonly fetch?: typeof fetch;
    readonly now?: () => Instant;
}

interface JevPost {
    readonly key: Text;
    readonly body: Text;
    readonly ids: readonly Text[];
}

const NO_KEY = 'a TypeSafe API key (TAB_RECAP_JEV_KEY, TYPESAFE_API_KEY or ~/.config/typesafe-api-key)';

const failure = (status: Count): Text => {
    if (status === 401 || status === 403) return must(parseText('refused: the key was not accepted'));
    if (status === 429 || status === 529) return must(parseText('busy: try again later'));
    return must(parseText(`HTTP ${status}`));
};

export class JevPortDecider implements DeciderPort {
    readonly label: Text;
    private readonly options: JevOptions;

    constructor(options: JevOptions) {
        this.options = options;
        this.label = must(parseText(`jev · ${options.model}`));
    }

    async ask(state: Text, questions: ReadonlyMap<Text, Question>): Promise<DecidedAnswersResult> {
        const key = this.options.key();
        if (key === null) return unknown({ why: 'not-found', what: textOf(NO_KEY) });
        const now = this.options.now ?? ((): Instant => instant(Date.now()));
        const began = now();
        const wire = Object.fromEntries([...questions].map(([id, noul]) => [id, { type: 'noul', ...noul }]));
        const reply = await this.post({ key, body: must(parseText(`{"model":${JSON.stringify(this.options.model)},"state":${state},"questions":${JSON.stringify(wire)}}`)), ids: [...questions.keys()] });
        if (isUnknown(reply)) return reply;
        const tokens = reply.inputTokens;
        return { kind: 'decided', answers: reply.answers, tokens, costUsd: must(parseUsd(tokens * USD_PER_INPUT_TOKEN)), tookMs: duration(now() - began), model: reply.model ?? must(parseText(this.options.model)) };
    }

    private async post(call: JevPost): Promise<JevReply | Unknown> {
        let response: Response;
        try {
            response = await (this.options.fetch ?? fetch)(this.options.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${call.key}` }, body: call.body, signal: AbortSignal.timeout(JEV_TIMEOUT_MS) });
        } catch (error) {
            return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
                ? unknown({ why: 'timeout', after: duration(JEV_TIMEOUT_MS) })
                : unknown({ why: 'unreachable', detail: causeOf(must(parseText(`the decider did not answer (${error instanceof Error ? error.name : 'error'})`))) });
        }
        if (!response.ok) return unknown({ why: 'failed', code: exitCodeOf(response.status), detail: causeOf(failure(must(parseCount(response.status)))) });
        try {
            return parseJevReply(await response.json(), call.ids);
        } catch {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText('the decider answered with something that is not JSON'))) });
        }
    }
}
