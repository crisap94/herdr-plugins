import type { Brand } from './brand.ts';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type HandoffId = Brand<string, 'HandoffId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type SessionPath = Brand<string, 'SessionPath'>;
export type AgentKind = Brand<string, 'AgentKind'>;
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

const HANDOFF_TYPE_ID = /^hnd_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

const isHandoffTypeId = (raw: string): raw is HandoffId => HANDOFF_TYPE_ID.test(raw);

export function handoffId(raw: string): HandoffId {
    if (!isHandoffTypeId(raw)) {
        throw new NotAnIdentifierError('a handoff id must be a TypeID: hnd_ and 26 base32 characters');
    }
    return raw;
}

export function parseHandoffId(raw: unknown): HandoffId | null {
    return typeof raw === 'string' && isHandoffTypeId(raw) ? raw : null;
}

export function agentKind(raw: string): AgentKind {
    return nonEmpty(raw, 'an agent kind') as AgentKind;
}
