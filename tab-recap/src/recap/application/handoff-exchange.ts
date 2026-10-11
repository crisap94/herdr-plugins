import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { HandoffQueue, HandoffRequester } from '#src/ports/requests.ts';
import { idGrammarOf, idTextOf } from '#src/protocol/codec.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { parseRequest, terminalStage } from '#src/protocol/exchange.ts';
import { requestId, toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { answer as answerOf, take } from '#src/protocol/responder.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { HandoffOffer, HandoffRefusal, RefreshAsk } from '#src/recap/domain/handoff-ask.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { paneId, parseHandoffId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { HandoffMirror, reportWrite } from './handoff-mirror.ts';
import type { HandoffLog, Route } from './handoff-mirror.ts';

export type TokenEntries = ReadonlyMap<Text, Text>;

interface Unparsed {
    readonly tool: Text;
    readonly id: Text;
}

interface IncomingRequest {
    readonly target: PaneId | null;
    readonly refresh: RefreshAsk;
}

const GRAMMAR = must(idGrammarOf(handoff.request));

const PREFIX = handoff.requestPrefix;

export interface HandoffExchangeDeps {
    readonly offer: () => HandoffOffer;
    readonly board: () => Board;
    readonly queue: HandoffQueue;
    readonly asks: AskLedger;
    readonly mirror: HandoffMirror;
    readonly tokens: LaneTokens;
    readonly now: () => Instant;
    readonly log: HandoffLog;
}

function unparsedOf(tokens: TokenEntries, asks: AskLedger): readonly Unparsed[] {
    return [...tokens].flatMap(([name, raw]): Unparsed[] => {
        const tool = name.startsWith(PREFIX) ? toolName(name.slice(PREFIX.length)) : null;
        const id = requestId(idTextOf(raw), GRAMMAR);
        if (tool === null || tool.kind === 'err' || id.kind === 'err' || parseRequest(handoff, raw).kind === 'ok' || asks.seen(HANDOFF_EXCHANGE, tool.value, id.value)) {
            return [];
        }
        return [{ tool: must(parseText(tool.value)), id: must(parseText(id.value)) }];
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

    onPaneTokens(pane: PaneId, tokens: TokenEntries): void {
        const record: TokenMap = Object.fromEntries(tokens);
        const taking = take(REGISTRY, record, this.deps.asks.seen.bind(this.deps.asks));
        for (const taken of taking.taken) {
            if (taken.exchange.name === HANDOFF_EXCHANGE) {
                const workspace = taken.value['workspace'];
                const lanePane = taken.value['pane'];
                const target = typeof workspace === 'string' && typeof lanePane === 'string' ? paneId(`${workspace}:${lanePane}`) : null;
                this.consider(pane, must(parseText(taken.tool)), must(parseText(taken.id)), { target, refresh: taken.value['refresh'] === true ? 'refresh' : 'plain' });
            }
        }
        for (const bad of unparsedOf(tokens, this.deps.asks)) {
            this.consider(pane, bad.tool, bad.id, null);
        }
    }

    private consider(pane: PaneId, tool: Text, id: Text, request: IncomingRequest | null): void {
        const offer = this.deps.offer();
        if (offer === 'sharing-off') {
            this.remember(pane, tool, id, { kind: 'off' });
            return;
        }
        if (offer === 'not-offered') {
            this.refuse(pane, tool, id, 'not-offered');
            return;
        }
        if (request === null) {
            this.refuse(pane, tool, id, 'bad-request');
            return;
        }
        const source = this.deps.board().lanes.get(pane);
        if (source === undefined) {
            this.refuse(pane, tool, id, 'not-a-lane');
            return;
        }
        const lane = request.target === null ? undefined : this.deps.board().lanes.get(request.target);
        if (request.target === null || lane === undefined || lane.workspace !== source.workspace) {
            this.refuse(pane, tool, id, 'target-elsewhere');
            return;
        }
        this.queue(source, request.target, tool, id, request.refresh);
    }

    private queue(source: Lane, target: PaneId, tool: Text, id: Text, refresh: RefreshAsk): void {
        const key = { exchange: HANDOFF_EXCHANGE, id: must(requestId(id, GRAMMAR)), pane: source.pane };
        const requester = must(toolName(tool));
        const route: Route = { source: source.pane, target, id };
        try {
            this.deps.queue.queueHandoff({ ...key, requester, at: this.deps.now(), ref: null }, { tab: source.tab, pane: source.pane, toPane: target, note: null, refreshFirst: refresh === 'refresh', source: { kind: 'live' }, answer: id });
        } catch (error) {
            this.deps.log(must(parseText(`handoff request ${id} on ${source.pane}: not queued (${failureCauseOf(error)})`)));
            return;
        }
        this.deps.mirror.queued(route);
    }

    private refuse(pane: PaneId, tool: Text, id: Text, reason: HandoffRefusal): void {
        this.remember(pane, tool, id, { kind: 'settled' });
        const write = answerOf(handoff, must(requestId(id, GRAMMAR)), terminalStage({ kind: 'refused', reason }));
        if (write.kind === 'ok') {
            void reportWrite(this.deps.tokens, this.deps.log, pane, write.value);
        }
    }

    private remember(pane: PaneId, tool: Text, id: Text, outcome: AskOutcome): void {
        const key = { exchange: HANDOFF_EXCHANGE, id: must(requestId(id, GRAMMAR)), pane };
        this.deps.asks.record({ ...key, requester: must(toolName(tool)), at: this.deps.now(), ref: null });
        this.deps.asks.settle(key, outcome);
    }
}
