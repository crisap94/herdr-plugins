import { ok } from './result.ts';
import type { Result } from './result.ts';
import type { Refusal, RequestId, ToolName } from './primitives.ts';
import { answerToken, failureStage, requestName, serializeRequest, splitAnswer } from './exchange.ts';
import type { Exchange } from './exchange.ts';
import type { ParsedValue } from './codec.ts';
import type { TokenMap, TokenWrite } from './tokens.ts';

export type AnswerState =
    | { readonly kind: 'not-seen' }
    | { readonly kind: 'queued' }
    | { readonly kind: 'running' }
    | { readonly kind: 'done' }
    | { readonly kind: 'failed'; readonly reason: string }
    | { readonly kind: 'foreign-id'; readonly id: string }
    | { readonly kind: 'unreadable' };

type LiveStage = 'queued' | 'running' | 'done';

const LIVE_STAGES: readonly LiveStage[] = ['queued', 'running', 'done'];

const isLiveStage = (stage: string): stage is LiveStage => (LIVE_STAGES as readonly string[]).includes(stage);

function stageObservation(exchange: Exchange, stage: string): AnswerState {
    const failure = exchange.failureReasons.find((reason) => failureStage(reason) === stage);
    if (failure !== undefined) {
        return { kind: 'failed', reason: failure };
    }
    return exchange.answerStages.includes(stage) && isLiveStage(stage) ? { kind: stage } : { kind: 'unreadable' };
}

export function observe(exchange: Exchange, tokens: TokenMap, id: RequestId): Result<AnswerState, Refusal> {
    const name = answerToken(exchange);
    if (name.kind === 'err') {
        return name;
    }
    const raw = tokens[name.value];
    if (raw === undefined || raw === '') {
        return ok({ kind: 'not-seen' });
    }
    const answer = splitAnswer(raw);
    if (answer === null) {
        return ok({ kind: 'unreadable' });
    }
    return ok(answer.id === id ? stageObservation(exchange, answer.stage) : { kind: 'foreign-id', id: answer.id });
}

export function request(exchange: Exchange, tool: ToolName, value: ParsedValue): Result<readonly TokenWrite[], Refusal> {
    const name = requestName(exchange, tool);
    if (name.kind === 'err') {
        return name;
    }
    const text = serializeRequest(exchange, value);
    return text.kind === 'err' ? text : ok([{ name: name.value, value: text.value }]);
}

export function withdraw(exchange: Exchange, tool: ToolName): Result<readonly TokenWrite[], Refusal> {
    const name = requestName(exchange, tool);
    return name.kind === 'err' ? name : ok([{ name: name.value, value: null }]);
}
