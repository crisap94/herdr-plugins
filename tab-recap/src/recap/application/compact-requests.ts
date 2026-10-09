// A compaction asked by another tool: a `compact-req-<tool>` token on a lane's pane. tab-recap queues it with origin `request` and answers in
// `tab-recap-compact` = `<id>:<stage>`. Each id is acted on once; a pane that is not a lane is answered `failed-not-a-lane`. Off, nothing is read.
import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, askedOf, answerValue, REQUEST_PREFIX } from '#src/recap/domain/compact-request.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { tokensOf } from './decode.ts';

/** how many requests are remembered: the oldest are forgotten past this (a pane is asked again only with a new id) */
const REMEMBERED = 500;

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly tokens: LaneTokens;
    readonly log: (line: string) => void;
}

export class CompactRequests {
    private readonly deps: CompactRequestDeps;
    private readonly seen = new Set<string>();

    constructor(deps: CompactRequestDeps) {
        this.deps = deps;
    }

    /** A `pane.updated` frame: every `compact-req-*` token whose id is new is acted on. */
    onPaneUpdated(data: Readonly<Record<string, unknown>>): void {
        const frame = tokensOf(data);
        if (frame === null || !this.deps.enabled()) {
            return;
        }
        for (const [name, value] of Object.entries(frame.tokens)) {
            const asked = name.startsWith(REQUEST_PREFIX) && name.length > REQUEST_PREFIX.length ? askedOf(value) : null;
            const key = asked === null ? '' : `${frame.pane}\u0000${asked.id}`;
            if (asked === null || this.seen.has(key)) {
                continue;
            }
            this.remember(key);
            this.act(frame.pane, asked.id, asked.note);
        }
    }

    /** The answer to a request, on its pane; nothing when herdr events are off by now. */
    answer(id: string, pane: string, stage: string): void {
        if (this.deps.enabled()) {
            void this.reply(id, pane, stage);
        }
    }

    private async reply(id: string, pane: string, stage: string): Promise<void> {
        const done = await this.deps.tokens.report(pane, { [COMPACT_TOKEN]: answerValue(id, stage) }, ANSWER_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`compaction request ${id} on ${pane}: not answered (${saying(done.why)})`);
        }
    }

    private act(pane: string, id: string, note: string | null): void {
        const lane = this.deps.board().lanes.get(paneId(pane));
        if (lane === undefined) {
            this.answer(id, pane, 'failed-not-a-lane');
            return;
        }
        this.deps.requests.requestCompact({ tab: String(lane.tab), pane, note, origin: 'request', answer: id });
        this.answer(id, pane, 'queued');
    }

    private remember(key: string): void {
        this.seen.add(key);
        if (this.seen.size > REMEMBERED) {
            this.seen.delete(this.seen.values().next().value ?? '');
        }
    }
}
