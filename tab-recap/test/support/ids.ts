import { must } from '@stateforge-labs/session-ledger';
import { parseAgentKind, parseHandoffId, parsePaneId, parseTabId, parseWorkspaceId } from '#src/recap/domain/ids.ts';
import type { HarnessKind, HandoffId, SessionKey, ScopeId, WorkspaceId } from '#src/recap/domain/ids.ts';

export const paneId = (raw: string): SessionKey => must(parsePaneId(raw));

export const tabId = (raw: string): ScopeId => must(parseTabId(raw));

export const workspaceId = (raw: string): WorkspaceId => must(parseWorkspaceId(raw));

export const agentKind = (raw: string): HarnessKind => must(parseAgentKind(raw));

export const handoffId = (raw: string): HandoffId => {
    const parsed = parseHandoffId(raw);
    if (parsed === null) {
        throw new Error(`not a handoff id: ${raw}`);
    }
    return parsed;
};
