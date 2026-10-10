// One compaction per lane: the panes whose compaction is queued or in progress in this daemon. A request for a claimed pane joins that compaction
// (answered with its stages and outcome) and starts nothing. Claiming is synchronous, so the check and the claim are one step and two requests
// cannot both take a pane.
import type { CompactRequest } from '#src/ports/requests.ts';

export class CompactionClaims {
    private readonly joined = new Map<string, CompactRequest[]>();

    /** Takes the pane when no compaction holds it; false when one does (the caller joins it instead). */
    claim(pane: string): boolean {
        if (this.joined.has(pane)) {
            return false;
        }
        this.joined.set(pane, []);
        return true;
    }

    /** Whether a compaction of the pane is queued or in progress. */
    has(pane: string): boolean {
        return this.joined.has(pane);
    }

    /** A request for a claimed pane waits for the running compaction: its answers follow the running one's. */
    join(pane: string, request: CompactRequest): void {
        this.joined.get(pane)?.push(request);
    }

    /** The requests that joined the running compaction of the pane. */
    joinedOf(pane: string): readonly CompactRequest[] {
        return this.joined.get(pane) ?? [];
    }

    /** The compaction of the pane is over (or was refused): the next request may start one. */
    release(pane: string): void {
        this.joined.delete(pane);
    }
}
