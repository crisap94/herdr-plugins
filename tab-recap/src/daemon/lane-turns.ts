import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import type { StatusEvent } from './slots.ts';

interface LaneTurnsParts {
    readonly hub: SettleHub;
    readonly compactions: Pick<CompactionRecords, 'dismissTurn'>;
    board(): Board;
    now(): number;
    statused?(event: StatusEvent): void;
}

export function laneTurns(parts: LaneTurnsParts): (pane: string, status: string) => void {
    return (pane, status) => {
        parts.hub.heard(pane, status);
        parts.statused?.({ pane: paneId(pane), status: laneStatus(status) });
        const lane = status === 'working' ? parts.board().lanes.get(paneId(pane)) : undefined;
        if (lane !== undefined) {
            parts.compactions.dismissTurn(String(lane.tab), pane, parts.now());
        }
    };
}
