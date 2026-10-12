import { ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import { parseNonEmptyText } from './text.ts';
import type { ParseFailure } from './parse-failure.ts';

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
    const parsed = parseWorkspaceId(raw);
    if (parsed.kind === 'err') {
        throw new NotAnIdentifierError('a workspace id cannot be empty');
    }
    return parsed.value;
}

export function workspaceOfTab(tab: TabId): WorkspaceId | null {
    const raw = String(tab);
    const colon = raw.indexOf(':');
    if (colon === -1 || raw.slice(0, colon).trim() === '' || raw.slice(colon + 1).trim() === '') {
        return null;
    }
    return raw.slice(0, colon) as WorkspaceId;
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

export function parsePaneId(input: unknown): Result<PaneId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'PaneId'>(text.value));
}

export function parseTabId(input: unknown): Result<TabId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'TabId'>(text.value));
}

export function parseWorkspaceId(input: unknown): Result<WorkspaceId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'WorkspaceId'>(text.value));
}

export function parseSessionId(input: unknown): Result<SessionId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'SessionId'>(text.value));
}

export function parseSessionPath(input: unknown): Result<SessionPath, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'SessionPath'>(text.value));
}

export function parseAgentKind(input: unknown): Result<AgentKind, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'AgentKind'>(text.value));
}
