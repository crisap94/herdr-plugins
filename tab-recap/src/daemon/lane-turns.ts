// What the daemon does with herdr's status pushes besides folding them: wake whoever waits for the lane, and end the showing of its compaction when its next turn starts.
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { SettleHub } from '#src/recap/application/settle-hub.ts';

export function laneTurns(parts: { readonly hub: SettleHub; readonly compactions: Pick<CompactionRecords, 'dismissTurn'>; board(): Board; now(): number }): (pane: string, status: string) => void {
    return (pane, status) => {
        parts.hub.heard(pane, status);
        const lane = status === 'working' ? parts.board().lanes.get(paneId(pane)) : undefined;
        if (lane !== undefined) {
            parts.compactions.dismissTurn(String(lane.tab), pane, parts.now());
        }
    };
}
