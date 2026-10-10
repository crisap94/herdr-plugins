// A compaction asked by another tool: a `compact-req-<tool>` token on a pane. tab-recap queues it with origin `request` and answers in
// `tab-recap-compact` = `<id>:<stage>`. Each (tool, id) is acted on once, across restarts (the asks are stored). A request seen while the setting is
// off is remembered and not acted on, so turning it on never runs a stale one. A pane that is not a lane is answered `failed-not-a-lane`; a request
// that comes before the board exists waits for it; an id that is empty or overlong is answered `failed-bad-id`. A restart answers what it interrupts
// `failed-interrupted`. Off, nothing is queued or answered.
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

/** how many requests may wait for the board, and how many bad values are remembered (so a bad one is answered once) */
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

    /** A `pane.updated` frame: every `compact-req-<tool>` token whose (tool, id) is new is acted on, or remembered while off. */
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

    /** Called each second: the requests that waited for the board are acted on once it exists. */
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

    /** The answer to a request, on its pane; nothing when herdr events are off by now. */
    answer(id: string, pane: string, stage: string): void {
        this.reply(pane, answerValue(id, stage));
    }

    /** A restart interrupted these requests (compactions not finished, and requests not yet taken): each is answered, none is run. */
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

    /** Written on the pane, while the setting is on; nothing for an empty pane. */
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
