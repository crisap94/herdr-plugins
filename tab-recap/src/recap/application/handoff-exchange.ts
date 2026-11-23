import type { AskEntry, AskBook } from '#src/ports/ask-ledger.ts';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { HandoffAskQueue, HandoffAsker } from '#src/ports/requests.ts';
import { idGrammarOf } from '#src/protocol/codec.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { parseRequest, terminalStage } from '#src/protocol/exchange.ts';
import { parseIdText, parseRequestId, parseToolName, parseWireText, refuse, type WireText } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { answerWrite, takeRequests } from '#src/protocol/responder.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { failureCauseOf, parseThrown } from '#src/recap/domain/failure-cause.ts';
import type { HandoffOffer, HandoffRefusal, RefreshAsk } from '#src/recap/domain/handoff-ask.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { parseHandoffId, parsePaneId } from '#src/recap/domain/ids.ts';
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
    readonly queue: HandoffAskQueue;
    readonly asks: AskBook;
    readonly mirror: HandoffMirror;
    readonly tokens: LaneTokenReporter;
    readonly now: () => Instant;
    readonly log: HandoffLog;
}

function unparsedOf(tokens: TokenEntries, asks: AskBook): readonly Unparsed[] {
    return [...tokens].flatMap(([name, raw]): Unparsed[] => {
        const tool = name.startsWith(PREFIX) ? parseToolName(name.slice(PREFIX.length)) : null;
        const id = parseRequestId(parseIdText(raw), GRAMMAR);
        const wire = parseWireText(raw);
        const parsed = wire.kind === 'ok' && parseRequest(handoff, wire.value).kind === 'ok';
        if (tool === null || tool.kind === 'err' || id.kind === 'err' || parsed || asks.seen(HANDOFF_EXCHANGE, tool.value, id.value) === 'seen') {
            return [];
        }
        return [{ tool: must(parseText(tool.value)), id: must(parseText(id.value)) }];
    });
}

export function withdrawAsked(requests: Pick<HandoffAsker, 'withdrawHandoff'>, ask: AskEntry): void {
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
        const wire = new Map<WireText, WireText>();
        for (const [name, raw] of tokens) {
            const key = parseWireText(name);
            const value = parseWireText(raw);
            if (key.kind === 'ok' && value.kind === 'ok') wire.set(key.value, value.value);
        }
        const taking = takeRequests(REGISTRY, wire, (exchange, requester, request) => (this.deps.asks.seen(exchange, requester, request) === 'seen' ? 'seen' : 'fresh'));
        for (const taken of taking.taken) {
            if (taken.exchange.name === HANDOFF_EXCHANGE) {
                const workspace = taken.value['workspace'];
                const lanePane = taken.value['pane'];
                const target = typeof workspace === 'string' && typeof lanePane === 'string' ? must(parsePaneId(`${workspace}:${lanePane}`)) : null;
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
        const key = { exchange: HANDOFF_EXCHANGE, id: must(parseRequestId(id, GRAMMAR)), pane: source.pane };
        const requester = must(parseToolName(tool));
        const route: Route = { source: source.pane, target, id };
        try {
            this.deps.queue.queueHandoff({ ...key, requester, at: this.deps.now(), ref: null }, { tab: source.tab, pane: source.pane, toPane: target, note: null, refresh: refresh === 'refresh' ? 'refresh-first' : 'as-is', source: { kind: 'live' }, answer: id });
        } catch (error) {
            this.deps.log(must(parseText(`handoff request ${id} on ${source.pane}: not queued (${failureCauseOf(parseThrown(error))})`)));
            return;
        }
        this.deps.mirror.queued(route);
    }

    private refuse(pane: PaneId, tool: Text, id: Text, reason: HandoffRefusal): void {
        this.remember(pane, tool, id, { kind: 'settled' });
        const stage = parseWireText(terminalStage({ kind: 'refused', reason }));
        const write = stage.kind === 'err' ? refuse(stage.error, 'TokenValue') : answerWrite(handoff, must(parseRequestId(id, GRAMMAR)), stage.value);
        if (write.kind === 'ok') {
            void reportWrite(this.deps.tokens, this.deps.log, pane, write.value);
        }
    }

    private remember(pane: PaneId, tool: Text, id: Text, outcome: AskOutcome): void {
        const key = { exchange: HANDOFF_EXCHANGE, id: must(parseRequestId(id, GRAMMAR)), pane };
        this.deps.asks.record({ ...key, requester: must(parseToolName(tool)), at: this.deps.now(), ref: null });
        this.deps.asks.settle(key, outcome);
    }
}
