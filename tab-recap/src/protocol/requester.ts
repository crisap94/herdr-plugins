import { ok } from './result.ts';
import type { Result } from './result.ts';
import type { Refusal, RequestId, ToolName } from './primitives.ts';
import { answerToken, requestName, serializeRequest, splitAnswer, terminalStage, terminalsOf } from './exchange.ts';
import type { Exchange, Terminal } from './exchange.ts';
import type { ParsedValue } from './codec.ts';
import type { ReasonWord } from './reasons.ts';
import type { TokenMap, TokenWrite } from './tokens.ts';

export type AnswerState =
    | { readonly kind: 'not-seen' }
    | { readonly kind: 'queued' }
    | { readonly kind: 'running' }
    | { readonly kind: 'done' }
    | { readonly kind: 'delivered' }
    | { readonly kind: 'failed'; readonly reason: string }
    | { readonly kind: 'refused'; readonly reason: ReasonWord }
    | { readonly kind: 'unsupported'; readonly reason: ReasonWord }
    | { readonly kind: 'foreign-id'; readonly id: string }
    | { readonly kind: 'unreadable' };

type LiveStage = 'queued' | 'running' | 'done' | 'delivered';

const LIVE_STAGES: readonly LiveStage[] = ['queued', 'running', 'done', 'delivered'];

const isLiveStage = (stage: string): stage is LiveStage => (LIVE_STAGES as readonly string[]).includes(stage);

const observedTerminal = (terminal: Terminal): AnswerState => {
    if (terminal.kind === 'failed') {
        return { kind: 'failed', reason: terminal.reason };
    }
    if (terminal.kind === 'refused') {
        return { kind: 'refused', reason: terminal.reason };
    }
    return { kind: 'unsupported', reason: terminal.reason };
};

function stageObservation(exchange: Exchange, stage: string): AnswerState {
    const terminal = terminalsOf(exchange).find((each) => terminalStage(each) === stage);
    if (terminal !== undefined) {
        return observedTerminal(terminal);
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
