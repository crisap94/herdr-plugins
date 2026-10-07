// Did a compaction happen? Asked of the agent's own records once it is free again. Read-only.
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Agents } from '#src/ports/agents.ts';
import type { Mark } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

/** `unconfirmed`: nothing in the records says either way. */
export type Outcome = 'compacted' | 'failed' | 'unconfirmed';

/** Time for the agent to start working on what was typed before it is first asked how it stands. */
const SETTLE_MS = 4000;
const POLL_MS = 2000;
/** The longest a compaction is waited for. */
const WAIT_MS = 10 * 60_000;
const READY = new Set(['idle', 'done']);

/** What the records say about a compaction that began at `since`: the newest mark from then on wins. */
export function verdictOf(marks: readonly Mark[], since: number): Outcome {
    const latest = marks.findLast((mark) => mark.at !== null && mark.at >= since);
    if (latest === undefined) {
        return 'unconfirmed';
    }
    return latest.kind === 'compacted' ? 'compacted' : 'failed';
}

export interface OutcomeDeps {
    readonly agents: Pick<Agents, 'status'>;
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: number): Promise<void>;
}

/** Waits until the agent is idle or done again (it is given a moment to start), then reads what its records say since `since`. */
export async function outcomeOf(deps: OutcomeDeps, lane: Lane, since: number, settle = true): Promise<Outcome> {
    if (settle) {
        await deps.pause(SETTLE_MS);
        for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
            const state = await deps.agents.status(String(lane.pane));
            if (isUnknown(state) || READY.has(state.status)) {
                break;
            }
            await deps.pause(POLL_MS);
        }
    }
    return verdictOf(await deps.marks(lane), since);
}
