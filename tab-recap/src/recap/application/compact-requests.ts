import type { Board } from '#src/recap/domain/board.ts';
import { uncheckedMilliseconds, type SessionKey } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, COMPACT_EXCHANGE, NOT_ACTED, noteOf } from '#src/recap/domain/compact-request.ts';
import { outcomeOf } from '#src/recap/domain/ask-outcome.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { RequestPort } from '#src/ports/requests.ts';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { failureStage, isFailureStage } from '#src/protocol/exchange.ts';
import { compact, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import { parseWireText, type RequestId, type ToolName, type WireText } from '#src/protocol/primitives.ts';
import { answerWrite, takeRequests } from '#src/protocol/responder.ts';
import type { Refused } from '#src/protocol/responder.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

const ANSWER_TTL = uncheckedMilliseconds(ANSWER_TTL_MS);
const PENDING_MAX = 200;
const BAD_MAX = 500;

export interface CompactRequestQueueDeps {
    readonly enabled: () => Presence;
    readonly board: () => Board;
    readonly requests: Pick<RequestPort, 'requestCompact'>;
    readonly asks: AskBook;
    readonly tokens: LaneTokenReporter;
    readonly now: () => Instant;
    readonly log: (line: Text) => void;
}

interface Incoming {
    readonly pane: SessionKey;
    readonly requester: ToolName;
    readonly id: RequestId;
    readonly note: Text | null;
}

export class CompactRequestQueue {
    private readonly deps: CompactRequestQueueDeps;
    private readonly pending: Incoming[] = [];
    private readonly badSeen = new Set<Text>();

    constructor(deps: CompactRequestQueueDeps) {
        this.deps = deps;
    }

    onPaneTokens(pane: SessionKey, tokens: ReadonlyMap<WireText, WireText>): void {
        if (pane.trim() === '') {
            return;
        }
        const taking = takeRequests(REGISTRY, tokens, (exchange, requester, id) => (this.deps.asks.seen(exchange, requester, id) === 'seen' ? 'seen' : 'fresh'));
        for (const refused of taking.refused) {
            if (refused.exchange.name === COMPACT_EXCHANGE) {
                this.refuseBadId(pane, refused);
            }
        }
        for (const taken of taking.taken) {
            if (taken.exchange.name === COMPACT_EXCHANGE) {
                const note = noteOf(taken.value);
                this.consider({ pane, requester: taken.tool, id: taken.id, note });
            }
        }
    }

    tick(): void {
        if (this.pending.length === 0 || !this.deps.board().seeded) {
            return;
        }
        for (const item of this.pending.splice(0)) {
            if (this.deps.enabled() === 'present' && this.deps.asks.seen(COMPACT_EXCHANGE, item.requester, item.id) === 'unseen') {
                this.act(item);
            }
        }
    }

    answer(id: RequestId, pane: SessionKey, stage: WireText): void {
        this.finish(id, pane, stage);
    }

    private consider(incoming: Incoming): void {
        if (this.deps.enabled() === 'absent') {
            this.remember(incoming);
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id: incoming.id, pane: incoming.pane }, NOT_ACTED);
        } else if (!this.deps.board().seeded) {
            if (this.pending.length < PENDING_MAX) {
                this.pending.push(incoming);
            }
        } else {
            this.act(incoming);
        }
    }

    private refuseBadId(pane: SessionKey, refused: Refused): void {
        const key = must(parseText(`${pane}\u0000${refused.exchange.name}\u0000${refused.tool}\u0000${refused.rawId}`));
        if (this.deps.enabled() === 'absent' || this.badSeen.has(key)) {
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
        const lane = this.deps.board().lanes.get(pane);
        if (lane === undefined) {
            this.remember(incoming);
            this.finish(id, pane, must(parseWireText(failureStage(COMPACT_FAILURES.notALane))));
            return;
        }
        this.remember(incoming);
        try {
            this.deps.requests.requestCompact({ tab: lane.tab, pane, note, origin: 'request', answer: textOf(id) });
        } catch (error) {
            this.deps.asks.withdraw({ exchange: COMPACT_EXCHANGE, requester: incoming.requester, id });
            this.deps.log(must(parseText(`compaction request ${id} on ${pane}: not queued (${error instanceof Error ? error.message : String(error)})`)));
            return;
        }
        this.finish(id, pane, must(parseWireText(COMPACT_STAGES.queued)));
    }

    private finish(id: RequestId, pane: SessionKey, stage: WireText): void {
        const outcome = stage === COMPACT_STAGES.done || isFailureStage(stage) ? outcomeOf(stage) : null;
        if (outcome !== null && pane !== '') {
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id, pane }, outcome);
        }
        const write = answerWrite(compact, id, stage);
        if (write.kind === 'ok') {
            this.reply(pane, write.value);
        }
    }

    private remember(incoming: Incoming): void {
        this.deps.asks.record({ exchange: COMPACT_EXCHANGE, requester: incoming.requester, id: incoming.id, pane: incoming.pane, at: this.deps.now(), ref: null });
    }

    private reply(pane: SessionKey, write: TokenWrite): void {
        if (this.deps.enabled() === 'absent' || pane === '') {
            return;
        }
        void this.write(pane, write);
    }

    private async write(pane: SessionKey, write: TokenWrite): Promise<void> {
        const done = await this.deps.tokens.report(pane, new Map([[write.name, write.value]]), ANSWER_TTL);
        if (isUnknown(done)) {
            this.deps.log(must(parseText(`compaction request on ${pane}: not answered (${saying(done.why)})`)));
        }
    }
}
