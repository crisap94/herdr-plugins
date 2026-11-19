import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { parsePaneId, type PaneId } from '#src/recap/domain/ids.ts';
import type { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneStatus, type LaneStatus } from '#src/recap/domain/status.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { StatusEvent } from './slots.ts';

export interface StatusPush {
    readonly pane: PaneId;
    readonly status: LaneStatus;
}

interface LaneTurnsParts {
    readonly hub: SettleHub;
    readonly compactions: Pick<CompactionRecords, 'dismissTurn'>;
    board(): Board;
    now(): Instant;
    statused?(event: StatusEvent): void;
}

export function laneTurns(parts: LaneTurnsParts): (push: StatusPush) => void {
    return ({ pane, status }) => {
        parts.hub.heard(pane, status);
        parts.statused?.({ pane, status });
        const lane = status === 'working' ? parts.board().lanes.get(pane) : undefined;
        if (lane !== undefined) {
            parts.compactions.dismissTurn(lane.tab, pane, parts.now());
        }
    };
}

export function parseStatusPush(turns: (push: StatusPush) => void, rawPane: unknown, rawStatus: unknown): void {
    const pane = parsePaneId(rawPane);
    if (pane.kind === 'ok') {
        turns({ pane: pane.value, status: laneStatus(typeof rawStatus === 'string' ? rawStatus : undefined) });
    }
}
