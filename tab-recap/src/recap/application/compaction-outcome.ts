import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Mark } from '#src/ports/transcripts.ts';

export type Outcome = 'compacted' | 'failed' | 'unconfirmed';

const WAIT_MS = 10 * 60_000;
const SLICE_MS = 60_000;
const REREADS = 3;
const REREAD_MS = 300;

const latestOf = (marks: readonly Mark[], since: number): Mark | undefined => marks.findLast((mark) => mark.at !== null && mark.at >= since);

export function verdictOf(marks: readonly Mark[], since: number): Outcome {
    const latest = latestOf(marks, since);
    if (latest === undefined) {
        return 'unconfirmed';
    }
    return latest.kind === 'compacted' ? 'compacted' : 'failed';
}

export interface Verdict {
    readonly outcome: Outcome;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
}

function verdictFrom(marks: readonly Mark[], since: number): Verdict {
    const outcome = verdictOf(marks, since);
    const mark = latestOf(marks, since);
    if (outcome !== 'compacted' || mark === undefined) {
        return { outcome };
    }
    return {
        outcome,
        ...(mark.tokensBefore === undefined ? {} : { tokensBefore: mark.tokensBefore }),
        ...(mark.tokensAfter === undefined ? {} : { tokensAfter: mark.tokensAfter }),
        ...(mark.tookMs === undefined ? {} : { tookMs: mark.tookMs }),
    };
}

export interface OutcomeDeps {
    readonly settling: LaneSettling;
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: number): Promise<void>;
}

export async function outcomeOf(deps: OutcomeDeps, lane: Lane, since: number, settle = true): Promise<Verdict> {
    if (settle) {
        await deps.settling.settled(String(lane.pane), since, WAIT_MS);
    }
    let verdict = verdictFrom(await deps.marks(lane), since);
    for (let read = 0; read < REREADS && verdict.outcome === 'unconfirmed'; read += 1) {
        await deps.pause(REREAD_MS);
        verdict = verdictFrom(await deps.marks(lane), since);
    }
    return verdict;
}

export interface QueuedDeps extends OutcomeDeps {
    now(): number;
}

export async function queuedOutcomeOf(deps: QueuedDeps, lane: Lane, typedAt: number, onTurnEnd: () => void): Promise<Verdict> {
    const deadline = typedAt + WAIT_MS;
    let since = typedAt;
    let turnEnded = false;
    for (;;) {
        const settled = await deps.settling.settled(String(lane.pane), since, Math.min(SLICE_MS, deadline - deps.now()));
        const verdict = await outcomeOf(deps, lane, typedAt, false);
        if (verdict.outcome !== 'unconfirmed' || deps.now() >= deadline) {
            return verdict;
        }
        if (settled.kind === 'settled' && !turnEnded) {
            turnEnded = true;
            onTurnEnd();
        }
        since = deps.now();
    }
}
