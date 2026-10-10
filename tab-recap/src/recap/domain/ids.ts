import type { Brand } from './brand.ts';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type SessionPath = Brand<string, 'SessionPath'>;
export type AgentKind = Brand<string, 'AgentKind'>;
export type HandoffId = Brand<string, 'HandoffId'>;
export type AgentSession =
    | { readonly kind: 'id'; readonly value: SessionId }
    | { readonly kind: 'path'; readonly value: SessionPath };

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

export function sessionIdFromAgentValue(raw: string): SessionId {
    return raw as SessionId;
}

export function sessionPath(raw: string): SessionPath {
    return nonEmpty(raw, 'a session path') as SessionPath;
}

export function sessionPathFromAgentValue(raw: string): SessionPath {
    return raw as SessionPath;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function handoffId(raw: string): HandoffId {
    if (!UUID_V7.test(raw)) {
        throw new NotAnIdentifierError('a handoff id must be a UUIDv7');
    }
    return raw as HandoffId;
}

export function agentKind(raw: string): AgentKind {
    return nonEmpty(raw, 'an agent kind') as AgentKind;
}
