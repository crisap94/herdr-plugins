import type { Frame } from '#src/ports/fleet-source.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';

const detected = (lane: SeenLane): Frame => ({
    event: 'pane.agent_detected',
    data: { pane_id: lane.paneId, tab_id: lane.tabId, workspace_id: lane.workspaceId, agent: lane.agent, agent_status: lane.status ?? null, cwd: lane.cwd ?? null, terminal_title_stripped: lane.title ?? null },
});

const closedFrame = (lane: SeenLane): Frame => ({ event: 'pane.closed', data: { pane_id: lane.paneId } });

const changedFrame = (lane: SeenLane): Frame => ({ event: 'pane.agent_status_changed', data: { pane_id: lane.paneId, agent_status: lane.status ?? null } });

export function framesBetween(before: readonly SeenLane[], after: readonly SeenLane[]): readonly Frame[] {
    const was = new Map(before.map((lane) => [lane.paneId, lane]));
    const is = new Set(after.map((lane) => lane.paneId));
    const closed = before.filter((lane) => !is.has(lane.paneId)).map(closedFrame);
    const changed = after.flatMap((lane): readonly Frame[] => {
        const earlier = was.get(lane.paneId);
        if (earlier === undefined) {
            return [detected(lane)];
        }
        return earlier.status === lane.status ? [] : [changedFrame(lane)];
    });
    return [...closed, ...changed];
}
