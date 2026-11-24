import { must } from '@stateforge-labs/session-ledger';
import { parseAgentKind, parsePaneId, parseSessionId, parseTabId, parseWorkspaceId } from './ids.ts';
import type { HarnessKind, SessionKey, SessionId, ScopeId, WorkspaceId } from './ids.ts';
import { laneStatus } from './status.ts';
import type { LaneStatus } from './status.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

export interface SeenLane {
    readonly paneId: Text;
    readonly tabId: Text;
    readonly workspaceId: Text;
    readonly agent: Text;
    readonly status?: Text | null | undefined;
    readonly session?: Text | null | undefined;
    readonly cwd?: Text | null | undefined;
    readonly title?: Text | null | undefined;
}

export interface Lane {
    readonly pane: SessionKey;
    readonly tab: ScopeId;
    readonly workspace: WorkspaceId;
    readonly agent: HarnessKind;
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
        pane: must(parsePaneId(seen.paneId)),
        tab: must(parseTabId(seen.tabId)),
        workspace: must(parseWorkspaceId(seen.workspaceId)),
        agent: must(parseAgentKind(seen.agent)),
        status: laneStatus(seen.status),
        session: session.kind === 'ok' && session.value.trim() !== '' ? must(parseSessionId(session.value)) : null,
        cwd: cwd.kind === 'ok' ? cwd.value : null,
        title: title.kind === 'ok' && title.value.trim() !== '' ? title.value : null,
        since: null,
    };
}

export function withStatus(lane: Lane, status: LaneStatus): Lane {
    return { ...lane, status };
}
