import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, answerValue, askedOf, badIdAnswer, REQUEST_PREFIX } from '#src/recap/domain/compact-request.ts';
import type { Asked } from '#src/recap/domain/compact-request.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import type { AskRecords } from '#src/ports/ask-records.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { tokensOf } from './decode.ts';

const PENDING_MAX = 200;
const BAD_MAX = 500;

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly asks: AskRecords;
    readonly tokens: LaneTokens;
    readonly log: (line: string) => void;
}

interface Pending {
    readonly pane: string;
    readonly tool: string;
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
        if (frame === null) {
            return;
        }
        for (const [name, value] of Object.entries(frame.tokens)) {
            const tool = name.startsWith(REQUEST_PREFIX) ? name.slice(REQUEST_PREFIX.length) : '';
            const asked = tool === '' ? null : askedOf(value);
            if (asked === null) {
                continue;
            }
            if (!asked.valid) {
                this.refuseBadId(frame.pane, `${name}\u0000${value}`, asked.id);
            } else if (!this.deps.asks.seen(tool, asked.id)) {
                this.consider(frame.pane, tool, asked);
            }
        }
    }

    tick(): void {
        if (this.pending.length === 0 || !this.deps.board().seeded) {
            return;
        }
        for (const item of this.pending.splice(0)) {
            if (this.deps.enabled() && !this.deps.asks.seen(item.tool, item.asked.id)) {
                this.act(item.pane, item.tool, item.asked);
            }
        }
    }

    answer(id: string, pane: string, stage: string): void {
        this.reply(pane, answerValue(id, stage));
    }

    answerInterrupted(asks: readonly { readonly pane: string; readonly answer: string }[]): void {
        for (const ask of asks) {
            this.answer(ask.answer, ask.pane, 'failed-interrupted');
        }
    }

    private consider(pane: string, tool: string, asked: Asked): void {
        if (!this.deps.enabled()) {
            this.deps.asks.remember(tool, asked.id, pane);
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

    private act(pane: string, tool: string, asked: Asked): void {
        const lane = this.deps.board().lanes.get(paneId(pane));
        if (lane === undefined) {
            this.deps.asks.remember(tool, asked.id, pane);
            this.answer(asked.id, pane, 'failed-not-a-lane');
            return;
        }
        try {
            this.deps.requests.requestCompact({ tab: String(lane.tab), pane, note: asked.note, origin: 'request', answer: asked.id });
        } catch (error) {
            this.deps.log(`compaction request ${asked.id} on ${pane}: not queued (${error instanceof Error ? error.message : String(error)})`);
            return;
        }
        this.deps.asks.remember(tool, asked.id, pane);
        this.answer(asked.id, pane, 'queued');
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
