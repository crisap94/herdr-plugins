import { ok, type Result } from '#src/protocol/result.ts';
import type { TabId } from './timing-ids.ts';
import type { Text } from './text.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type HandoffId = Brand<string, 'HandoffId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type SessionPath = Brand<string, 'SessionPath'>;
export interface AgentSessionId {
    readonly kind: 'id';
    readonly value: SessionId;
}

export interface AgentSessionPath {
    readonly kind: 'path';
    readonly value: SessionPath;
}

export type AgentSession = AgentSessionId | AgentSessionPath;

export type { AgentKind, CompactionId, DecisionId, PaneId, TabId } from './timing-ids.ts';
export class NotAnIdentifierError extends Error {
    override readonly name = 'NotAnIdentifierError';
}

export function workspaceOfTab(tab: TabId): WorkspaceId | null {
    const raw = String(tab);
    const colon = raw.indexOf(':');
    if (colon === -1 || raw.slice(colon + 1).trim() === '') {
        return null;
    }
    const workspace = parseWorkspaceId(raw.slice(0, colon));
    return workspace.kind === 'ok' ? workspace.value : null;
}

export const isUncheckedSessionId = (raw: unknown): raw is SessionId => typeof raw === 'string';

export const isUncheckedSessionPath = (raw: unknown): raw is SessionPath => typeof raw === 'string';

const HANDOFF_TYPE_ID = /^hnd_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

const isHandoffTypeId = (raw: unknown): raw is HandoffId => typeof raw === 'string' && HANDOFF_TYPE_ID.test(raw);

export function parseHandoffId(raw: unknown): HandoffId | null {
    return isHandoffTypeId(raw) ? raw : null;
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

export const uncheckedTabId = brand<string, 'TabId'>;

export const uncheckedRatio = brand<number, 'Probability'>;

export const uncheckedPaneId = brand<string, 'PaneId'>;

export { parseAgentKind, parseCompactionId, parseDecisionId, parsePaneId, parseTabId } from './timing-ids.ts';
export { agentKind, paneId, tabId, workspaceId } from './legacy.ts';

export function sessionId(raw: Text): SessionId {
    const parsed = parseSessionId(raw);
    if (parsed.kind === 'err') {
        throw new NotAnIdentifierError('a session id cannot be empty');
    }
    return parsed.value;
}

export function sessionIdFromAgentValue(raw: Text): SessionId {
    if (isUncheckedSessionId(raw)) {
        return raw;
    }
    throw new NotAnIdentifierError('a session id cannot be empty');
}

export function sessionPathFromAgentValue(raw: Text): SessionPath {
    if (isUncheckedSessionPath(raw)) {
        return raw;
    }
    throw new NotAnIdentifierError('a session path cannot be empty');
}

export function handoffId(raw: Text): HandoffId {
    const parsed = parseHandoffId(raw);
    if (parsed === null) {
        throw new NotAnIdentifierError('a handoff id must be a TypeID: hnd_ and 26 base32 characters');
    }
    return parsed;
}
