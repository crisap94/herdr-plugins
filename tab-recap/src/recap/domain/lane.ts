import { must } from '@stateforge-labs/session-ledger';
import { parseAgentKind, parsePaneId, parseSessionId, parseTabId, parseWorkspaceId } from './ids.ts';
import { laneStatus } from './status.ts';
import type { LaneStatus } from './status.ts';
import { parseDirectory } from '@stateforge-labs/session-ledger';
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

import type { LegacyFollowedSession, ScopeId, SessionKey } from '@stateforge-labs/session-ledger';

export type FollowedSession = Omit<LegacyFollowedSession, 'key' | 'scope'> & { readonly pane: SessionKey; readonly tab: ScopeId };

export function seatOf(lane: FollowedSession): LegacyFollowedSession {
    const { pane, tab, ...rest } = lane;
    return { ...rest, key: pane, scope: tab };
}

export function laneFrom(seen: SeenLane): FollowedSession {
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

export function tryLaneFrom(seen: SeenLane): FollowedSession | null {
    const parsed = [parsePaneId(seen.paneId), parseTabId(seen.tabId), parseWorkspaceId(seen.workspaceId), parseAgentKind(seen.agent)];
    return parsed.every((each) => each.kind === 'ok') ? laneFrom(seen) : null;
}

export function withStatus(lane: FollowedSession, status: LaneStatus): FollowedSession {
    return { ...lane, status };
}
