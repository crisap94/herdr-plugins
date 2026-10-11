import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { HandoffRequester } from '#src/ports/requests.ts';
import { idGrammarOf, idTextOf } from '#src/protocol/codec.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { parseRequest, terminalStage } from '#src/protocol/exchange.ts';
import { requestId, toolName } from '#src/protocol/primitives.ts';
import type { RequestId, ToolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { answer as answerOf, take } from '#src/protocol/responder.ts';
import type { SeenCheck } from '#src/protocol/responder.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import type { HandoffId, PaneId } from '#src/recap/domain/ids.ts';
import { paneId, parseHandoffId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import { askKeyOf, HandoffMirror, reportWrite } from './handoff-mirror.ts';
import type { Route } from './handoff-mirror.ts';

export type HandoffOffer = 'sharing-off' | 'not-offered' | 'offered';

type Refusal = 'not-offered' | 'bad-request' | 'not-a-lane' | 'target-elsewhere';

interface Unparsed {
    readonly tool: ToolName;
    readonly id: RequestId;
}

const GRAMMAR = must(idGrammarOf(handoff.request));

const PREFIX = handoff.requestPrefix;

export interface HandoffExchangeDeps {
    readonly offer: () => HandoffOffer;
    readonly board: () => Board;
    readonly requests: Pick<HandoffRequester, 'requestHandoff'>;
    readonly asks: AskLedger;
    readonly mirror: HandoffMirror;
    readonly tokens: LaneTokens;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

function targetOf(value: ParsedValue): PaneId | null {
    const workspace = value['workspace'];
    const pane = value['pane'];
    return typeof workspace === 'string' && typeof pane === 'string' ? paneId(`${workspace}:${pane}`) : null;
}

function unparsedOf(tokens: TokenMap, seen: SeenCheck): readonly Unparsed[] {
    return Object.entries(tokens).flatMap(([name, raw]): Unparsed[] => {
        const tool = name.startsWith(PREFIX) ? toolName(name.slice(PREFIX.length)) : null;
        const id = requestId(idTextOf(raw), GRAMMAR);
        if (tool === null || tool.kind === 'err' || id.kind === 'err' || parseRequest(handoff, raw).kind === 'ok' || seen(HANDOFF_EXCHANGE, tool.value, id.value)) {
            return [];
        }
        return [{ tool: tool.value, id: id.value }];
    });
}

export function withdrawAsked(requests: Pick<HandoffRequester, 'withdrawHandoff'>, ask: Ask): void {
    const id = parseHandoffId(ask.ref);
    if (id !== null) {
        requests.withdrawHandoff(id);
    }
}

export class HandoffExchangeResponder {
    private readonly deps: HandoffExchangeDeps;

    constructor(deps: HandoffExchangeDeps) {
        this.deps = deps;
    }

    onPaneTokens(pane: PaneId, tokens: TokenMap): void {
        const seen: SeenCheck = (exchange, tool, id) => this.deps.asks.seen(exchange, tool, id);
        const taking = take(REGISTRY, tokens, seen);
        for (const taken of taking.taken) {
            if (taken.exchange.name === HANDOFF_EXCHANGE) {
                this.consider(pane, taken.tool, taken.id, taken.value);
            }
        }
        for (const bad of unparsedOf(tokens, seen)) {
            this.consider(pane, bad.tool, bad.id, null);
        }
    }

    private consider(pane: PaneId, tool: ToolName, id: RequestId, value: ParsedValue | null): void {
        const offer = this.deps.offer();
        if (offer === 'sharing-off') {
            this.remember(pane, tool, id, { kind: 'off' });
            return;
        }
        if (offer === 'not-offered') {
            this.refuse(pane, tool, id, 'not-offered');
            return;
        }
        if (value === null) {
            this.refuse(pane, tool, id, 'bad-request');
            return;
        }
        const source = this.deps.board().lanes.get(pane);
        if (source === undefined) {
            this.refuse(pane, tool, id, 'not-a-lane');
            return;
        }
        const target = targetOf(value);
        const lane = target === null ? undefined : this.deps.board().lanes.get(target);
        if (target === null || lane === undefined || lane.workspace !== source.workspace) {
            this.refuse(pane, tool, id, 'target-elsewhere');
            return;
        }
        this.queue(source, target, tool, id, value['refresh'] === true);
    }

    private queue(source: Lane, target: PaneId, tool: ToolName, id: RequestId, refresh: boolean): void {
        this.deps.asks.record({ exchange: HANDOFF_EXCHANGE, requester: tool, id, pane: source.pane, at: this.deps.now(), ref: null });
        const route: Route = { source: source.pane, target, id };
        let handoffId: HandoffId;
        try {
            handoffId = this.deps.requests.requestHandoff({ tab: source.tab, pane: source.pane, toPane: target, note: null, refreshFirst: refresh, source: { kind: 'live' }, answer: id });
        } catch (error) {
            this.deps.asks.withdraw({ exchange: HANDOFF_EXCHANGE, requester: tool, id });
            this.deps.log(`handoff request ${id} on ${source.pane}: not queued (${error instanceof Error ? error.message : String(error)})`);
            return;
        }
        this.deps.asks.attach(askKeyOf(route), handoffId);
        this.deps.mirror.queued(route);
    }

    private refuse(pane: PaneId, tool: ToolName, id: RequestId, reason: Refusal): void {
        this.remember(pane, tool, id, { kind: 'settled' });
        const write = answerOf(handoff, id, terminalStage({ kind: 'refused', reason }));
        if (write.kind === 'ok') {
            reportWrite(this.deps.tokens, this.deps.log, pane, write.value);
        }
    }

    private remember(pane: PaneId, tool: ToolName, id: RequestId, outcome: AskOutcome): void {
        this.deps.asks.record({ exchange: HANDOFF_EXCHANGE, requester: tool, id, pane, at: this.deps.now(), ref: null });
        this.deps.asks.settle({ exchange: HANDOFF_EXCHANGE, id, pane }, outcome);
    }
}
