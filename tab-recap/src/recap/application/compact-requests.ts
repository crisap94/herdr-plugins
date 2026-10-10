import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, answerValue, askedOf, badIdAnswer, COMPACT_EXCHANGE, isTerminalStage, NOT_ACTED, REQUEST_PREFIX } from '#src/recap/domain/compact-request.ts';
import type { Asked } from '#src/recap/domain/compact-request.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { toolName } from '#src/protocol/primitives.ts';
import type { ToolName } from '#src/protocol/primitives.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { tokensOf } from './decode.ts';

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

interface Pending {
    readonly pane: string;
    readonly tool: ToolName;
    readonly asked: Asked;
}

export class CompactRequests {
    private readonly deps: CompactRequestDeps;
    private readonly pending: Pending[] = [];
    private readonly badSeen = new Set<string>();

    constructor(deps: CompactRequestDeps) {
        this.deps = deps;
    }

    onPaneUpdated(data: Readonly<Record<string, unknown>>): void {
        const frame = tokensOf(data);
        if (frame !== null) {
            this.onPaneTokens(frame.pane, frame.tokens);
        }
    }

    onPaneTokens(pane: string, tokens: TokenMap): void {
        for (const [name, value] of Object.entries(tokens)) {
            const raw = name.startsWith(REQUEST_PREFIX) ? name.slice(REQUEST_PREFIX.length) : '';
            const asked = raw === '' ? null : askedOf(value);
            if (asked === null) {
                continue;
            }
            if (!asked.valid) {
                this.refuseBadId(pane, `${name}\u0000${value}`, asked.id);
                continue;
            }
            const tool = toolName(raw);
            if (tool.kind === 'ok' && !this.deps.asks.seen(COMPACT_EXCHANGE, tool.value, asked.id)) {
                this.consider(pane, tool.value, asked);
            }
        }
    }

    tick(): void {
        if (this.pending.length === 0 || !this.deps.board().seeded) {
            return;
        }
        for (const item of this.pending.splice(0)) {
            if (this.deps.enabled() && !this.deps.asks.seen(COMPACT_EXCHANGE, item.tool, item.asked.id)) {
                this.act(item.pane, item.tool, item.asked);
            }
        }
    }

    answer(id: string, pane: string, stage: string): void {
        if (isTerminalStage(stage)) {
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id, pane }, stage);
        }
        this.reply(pane, answerValue(id, stage));
    }

    answerInterrupted(asks: readonly { readonly pane: string; readonly answer: string }[]): void {
        for (const ask of asks) {
            this.answer(ask.answer, ask.pane, 'failed-interrupted');
        }
    }

    private consider(pane: string, tool: ToolName, asked: Asked): void {
        if (!this.deps.enabled()) {
            this.remember(pane, tool, asked.id);
            this.deps.asks.settle({ exchange: COMPACT_EXCHANGE, id: asked.id, pane }, NOT_ACTED);
        } else if (!this.deps.board().seeded) {
            if (this.pending.length < PENDING_MAX) {
                this.pending.push({ pane, tool, asked });
            }
        } else {
            this.act(pane, tool, asked);
        }
    }

    private refuseBadId(pane: string, key: string, id: string): void {
        if (!this.deps.enabled() || this.badSeen.has(`${pane}\u0000${key}`)) {
            return;
        }
        if (this.badSeen.size >= BAD_MAX) {
            this.badSeen.clear();
        }
        this.badSeen.add(`${pane}\u0000${key}`);
        this.reply(pane, badIdAnswer(id));
    }

    private act(pane: string, tool: ToolName, asked: Asked): void {
        const lane = this.deps.board().lanes.get(paneId(pane));
        if (lane === undefined) {
            this.remember(pane, tool, asked.id);
            this.answer(asked.id, pane, 'failed-not-a-lane');
            return;
        }
        try {
            this.deps.requests.requestCompact({ tab: String(lane.tab), pane, note: asked.note, origin: 'request', answer: asked.id });
        } catch (error) {
            this.deps.log(`compaction request ${asked.id} on ${pane}: not queued (${error instanceof Error ? error.message : String(error)})`);
            return;
        }
        this.remember(pane, tool, asked.id);
        this.answer(asked.id, pane, 'queued');
    }

    private remember(pane: string, tool: ToolName, id: string): void {
        this.deps.asks.record({ exchange: COMPACT_EXCHANGE, requester: tool, id, pane, at: this.deps.now(), ref: null });
    }

    private reply(pane: string, value: string): void {
        if (!this.deps.enabled() || pane === '') {
            return;
        }
        void this.write(pane, value);
    }

    private async write(pane: string, value: string): Promise<void> {
        const done = await this.deps.tokens.report(pane, { [COMPACT_TOKEN]: value }, ANSWER_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`compaction request on ${pane}: not answered (${saying(done.why)})`);
        }
    }
}
