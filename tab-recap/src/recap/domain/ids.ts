import type { Brand } from './brand.ts';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AgentKind = Brand<string, 'AgentKind'>;

export class NotAnIdentifierError extends Error {
    override readonly name = 'NotAnIdentifierError';
}

function nonEmpty(raw: string, what: string): string {
    if (raw.trim() === '') {
        throw new NotAnIdentifierError(`${what} cannot be empty`);
    }
    return raw;
}

export function paneId(raw: string): PaneId {
    return nonEmpty(raw, 'a pane id') as PaneId;
}

export function tabId(raw: string): TabId {
    return nonEmpty(raw, 'a tab id') as TabId;
}

export function workspaceId(raw: string): WorkspaceId {
    return nonEmpty(raw, 'a workspace id') as WorkspaceId;
}

export function sessionId(raw: string): SessionId {
    return nonEmpty(raw, 'a session id') as SessionId;
}

export function agentKind(raw: string): AgentKind {
    return nonEmpty(raw, 'an agent kind') as AgentKind;
}
