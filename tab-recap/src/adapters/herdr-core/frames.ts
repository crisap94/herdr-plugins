import type { FleetFrame } from '#src/ports/fleet-source.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

type FrameField = 'pane_id' | 'tab_id' | 'workspace_id' | 'agent' | 'agent_status' | 'cwd' | 'terminal_title_stripped';

type Fields = Readonly<Partial<Record<FrameField, Text | null>>>;

const frameOf = (event: Text, data: Fields): FleetFrame => ({ event, payload: textOf(JSON.stringify(data)) });

const detected = (lane: SeenLane): FleetFrame => frameOf(textOf('pane.agent_detected'), { pane_id: lane.paneId, tab_id: lane.tabId, workspace_id: lane.workspaceId, agent: lane.agent, agent_status: lane.status ?? null, cwd: lane.cwd ?? null, terminal_title_stripped: lane.title ?? null });

const closedFrame = (lane: SeenLane): FleetFrame => frameOf(textOf('pane.closed'), { pane_id: lane.paneId });

const changedFrame = (lane: SeenLane): FleetFrame => frameOf(textOf('pane.agent_status_changed'), { pane_id: lane.paneId, agent_status: lane.status ?? null });

export function framesBetween(before: readonly SeenLane[], after: readonly SeenLane[]): readonly FleetFrame[] {
    const was = new Map(before.map((lane) => [lane.paneId, lane]));
    const is = new Set(after.map((lane) => lane.paneId));
    const closed = before.filter((lane) => !is.has(lane.paneId)).map(closedFrame);
    const changed = after.flatMap((lane): readonly FleetFrame[] => {
        const earlier = was.get(lane.paneId);
        if (earlier === undefined) {
            return [detected(lane)];
        }
        return earlier.status === lane.status ? [] : [changedFrame(lane)];
    });
    return [...closed, ...changed];
}
