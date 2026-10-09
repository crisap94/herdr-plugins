// A compaction asked by another tool: a `compact-req-<tool>` token on a pane. tab-recap queues it with origin `request` and answers in
// `tab-recap-compact` = `<id>:<stage>`. Each (tool, id) is acted on once, across restarts (the asks are stored). A pane that is not a lane is
// answered `failed-not-a-lane`. A request a restart interrupts is answered `failed-interrupted`. Off, nothing is read, answered or queued.
import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ANSWER_TTL_MS, askedOf, answerValue, REQUEST_PREFIX } from '#src/recap/domain/compact-request.ts';
import type { Asked } from '#src/recap/domain/compact-request.ts';
import { COMPACT_TOKEN } from '#src/recap/domain/lane-tokens.ts';
import type { AskRecords } from '#src/ports/ask-records.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { tokensOf } from './decode.ts';

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly asks: AskRecords;
    readonly tokens: LaneTokens;
    readonly log: (line: string) => void;
}

export class CompactRequests {
    private readonly deps: CompactRequestDeps;

    constructor(deps: CompactRequestDeps) {
        this.deps = deps;
    }

    /** A `pane.updated` frame: every `compact-req-<tool>` token whose (tool, id) is new is acted on. */
    onPaneUpdated(data: Readonly<Record<string, unknown>>): void {
        const frame = tokensOf(data);
        if (frame === null || !this.deps.enabled()) {
            return;
        }
        for (const [name, value] of Object.entries(frame.tokens)) {
            const tool = name.startsWith(REQUEST_PREFIX) ? name.slice(REQUEST_PREFIX.length) : '';
            const asked = tool === '' ? null : askedOf(value);
            if (asked !== null && !this.deps.asks.seen(tool, asked.id)) {
                this.act(frame.pane, tool, asked);
            }
        }
    }

    /** The answer to a request, on its pane; nothing when herdr events are off by now. */
    answer(id: string, pane: string, stage: string): void {
        if (this.deps.enabled()) {
            void this.reply(id, pane, stage);
        }
    }

    /** A restart interrupted these requests (compactions not finished, and requests not yet taken): each is answered, none is run. */
    answerInterrupted(asks: readonly { readonly pane: string; readonly answer: string }[]): void {
        for (const ask of asks) {
            this.answer(ask.answer, ask.pane, 'failed-interrupted');
        }
    }

    private async reply(id: string, pane: string, stage: string): Promise<void> {
        const done = await this.deps.tokens.report(pane, { [COMPACT_TOKEN]: answerValue(id, stage) }, ANSWER_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`compaction request ${id} on ${pane}: not answered (${saying(done.why)})`);
        }
    }

    private act(pane: string, tool: string, asked: Asked): void {
        const lane = this.deps.board().lanes.get(paneId(pane));
        this.deps.asks.remember(tool, asked.id, pane);
        if (lane === undefined) {
            this.answer(asked.id, pane, 'failed-not-a-lane');
            return;
        }
        this.deps.requests.requestCompact({ tab: String(lane.tab), pane, note: asked.note, origin: 'request', answer: asked.id });
        this.answer(asked.id, pane, 'queued');
    }
}
