import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, COMPACT_EXCHANGE, isTerminalStage, NOT_ACTED, noteOf, parseAskId } from '#src/recap/domain/compact-request.ts';
import { outcomeOf } from '#src/recap/domain/ask-outcome.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { failureStage } from '#src/protocol/exchange.ts';
import { compact, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import type { RequestId, ToolName } from '#src/protocol/primitives.ts';
import { answer as answerOf, take } from '#src/protocol/responder.ts';
import type { Refused } from '#src/protocol/responder.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';

const PENDING_MAX = 200;
const BAD_MAX = 500;

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly asks: AskLedger;
    readonly tokens: LaneTokens;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

interface Incoming {
    readonly pane: string;
    readonly requester: ToolName;
    readonly id: RequestId;
    readonly note: string | null;
}

export class CompactRequests {
    private readonly deps: CompactRequestDeps;
    private readonly pending: Incoming[] = [];
    private readonly badSeen = new Set<string>();

    constructor(deps: CompactRequestDeps) {
        this.deps = deps;
    }

    onPaneTokens(pane: string, tokens: TokenMap): void {
        if (pane.trim() === '') {
            return;
        }
        const taking = take(REGISTRY, tokens, (exchange, requester, id) => this.deps.asks.seen(exchange, requester, id));
        for (const refused of taking.refused) {
            if (refused.exchange.name === COMPACT_EXCHANGE) {
                this.refuseBadId(pane, refused);
            }
        }
        for (const taken of taking.taken) {
            if (taken.exchange.name === COMPACT_EXCHANGE) {
                this.consider({ pane, requester: taken.tool, id: taken.id, note: noteOf(taken.value) });
            }
        }
    }

    tick(): void {
        if (this.pending.length === 0 || !this.deps.board().seeded) {
            return;
        }
        for (const item of this.pending.splice(0)) {
            if (this.deps.enabled() && !this.deps.asks.seen(COMPACT_EXCHANGE, item.requester, item.id)) {
                this.act(item);
            }
        }
    }

    answer(id: string, pane: string, stage: string): void {
        const askId = parseAskId(id);
        if (askId !== null) {
            this.finish(askId, pane, stage);
        }
    }

    private consider(incoming: Incoming): void {
        if (!this.deps.enabled()) {
            this.remember(incoming);
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id: incoming.id, pane: paneId(incoming.pane) }, NOT_ACTED);
        } else if (!this.deps.board().seeded) {
            if (this.pending.length < PENDING_MAX) {
                this.pending.push(incoming);
            }
        } else {
            this.act(incoming);
        }
    }

    private refuseBadId(pane: string, refused: Refused): void {
        const key = `${pane}\u0000${refused.exchange.name}\u0000${refused.tool}\u0000${refused.rawId}`;
        if (!this.deps.enabled() || this.badSeen.has(key)) {
            return;
        }
        if (this.badSeen.size >= BAD_MAX) {
            this.badSeen.clear();
        }
        this.badSeen.add(key);
        this.reply(pane, { name: COMPACT_TOKEN, value: refused.answer });
    }

    private act(incoming: Incoming): void {
        const { pane, id, note } = incoming;
        const lane = this.deps.board().lanes.get(paneId(pane));
        if (lane === undefined) {
            this.remember(incoming);
            this.finish(id, pane, failureStage(COMPACT_FAILURES.notALane));
            return;
        }
        this.remember(incoming);
        try {
            this.deps.requests.requestCompact({ tab: String(lane.tab), pane, note, origin: 'request', answer: id });
        } catch (error) {
            this.deps.asks.withdraw({ exchange: COMPACT_EXCHANGE, requester: incoming.requester, id });
            this.deps.log(`compaction request ${id} on ${pane}: not queued (${error instanceof Error ? error.message : String(error)})`);
            return;
        }
        this.finish(id, pane, COMPACT_STAGES.queued);
    }

    private finish(id: RequestId, pane: string, stage: string): void {
        const outcome = isTerminalStage(stage) ? outcomeOf(stage) : null;
        if (outcome !== null && pane !== '') {
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id, pane: paneId(pane) }, outcome);
        }
        const write = answerOf(compact, id, stage);
        if (write.kind === 'ok') {
            this.reply(pane, write.value);
        }
    }

    private remember(incoming: Incoming): void {
        this.deps.asks.record({ exchange: COMPACT_EXCHANGE, requester: incoming.requester, id: incoming.id, pane: paneId(incoming.pane), at: this.deps.now(), ref: null });
    }

    private reply(pane: string, write: TokenWrite): void {
        if (!this.deps.enabled() || pane === '') {
            return;
        }
        void this.write(pane, write);
    }

    private async write(pane: string, write: TokenWrite): Promise<void> {
        const done = await this.deps.tokens.report(pane, { [write.name]: write.value }, ANSWER_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`compaction request on ${pane}: not answered (${saying(done.why)})`);
        }
    }
}
