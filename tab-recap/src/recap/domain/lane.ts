import { agentKind, paneId, sessionId, tabId, workspaceId } from './ids.ts';
import type { AgentKind, PaneId, SessionId, TabId, WorkspaceId } from './ids.ts';
import { laneStatus } from './status.ts';
import type { LaneStatus } from './status.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { parseDirectory } from '@stateforge-labs/session-ledger/unstable/recap/domain/directory.ts';
import type { Directory } from '@stateforge-labs/session-ledger/unstable/recap/domain/directory.ts';
import { parseText, textOf, type Text } from './text.ts';
import type { SeenLane } from './twins/lane/legacy.ts';

export type { SeenLane } from './twins/lane/legacy.ts';

export interface Lane {
    readonly pane: PaneId;
    readonly tab: TabId;
    readonly workspace: WorkspaceId;
    readonly agent: AgentKind;
    readonly status: LaneStatus;
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
    readonly title: Text | null;
    readonly since: Instant | null;
}

export function laneFrom(seen: SeenLane): Lane {
    const session = parseText(seen.session);
    const cwd = parseDirectory(seen.cwd);
    const title = parseText(seen.title);
    return {
        pane: paneId(seen.paneId),
        tab: tabId(seen.tabId),
        workspace: workspaceId(seen.workspaceId),
        agent: agentKind(seen.agent),
        status: laneStatus(seen.status === undefined || seen.status === null ? seen.status : textOf(seen.status)),
        session: session.kind === 'ok' && session.value.trim() !== '' ? sessionId(textOf(session.value)) : null,
        cwd: cwd.kind === 'ok' ? cwd.value : null,
        title: title.kind === 'ok' && title.value.trim() !== '' ? title.value : null,
        since: null,
    };
}

export function withStatus(lane: Lane, status: LaneStatus): Lane {
    return { ...lane, status };
}
