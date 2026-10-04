import { agentKind, paneId, sessionId, tabId, workspaceId } from './ids.ts';
import type { AgentKind, PaneId, SessionId, TabId, WorkspaceId } from './ids.ts';
import { laneStatus } from './status.ts';
import type { LaneStatus } from './status.ts';

/** What an adapter saw of a lane, before it is trusted: plain strings. */
export interface SeenLane {
    readonly paneId: string;
    readonly tabId: string;
    readonly workspaceId: string;
    readonly agent: string;
    readonly status?: string | null | undefined;
    readonly session?: string | null | undefined;
    readonly cwd?: string | null | undefined;
    readonly title?: string | null | undefined;
}

export interface Lane {
    readonly pane: PaneId;
    readonly tab: TabId;
    readonly workspace: WorkspaceId;
    readonly agent: AgentKind;
    readonly status: LaneStatus;
    readonly session: SessionId | null;
    readonly cwd: string | null;
    readonly title: string | null;
}

function orNull(raw: string | null | undefined): string | null {
    return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

export function laneFrom(seen: SeenLane): Lane {
    const session = orNull(seen.session);
    return {
        pane: paneId(seen.paneId),
        tab: tabId(seen.tabId),
        workspace: workspaceId(seen.workspaceId),
        agent: agentKind(seen.agent),
        status: laneStatus(seen.status),
        session: session === null ? null : sessionId(session),
        cwd: orNull(seen.cwd),
        title: orNull(seen.title),
    };
}

export function withStatus(lane: Lane, status: LaneStatus): Lane {
    return { ...lane, status };
}
