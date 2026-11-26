import { ok, type Result } from '@stateforge-labs/session-ledger';
import type { BackendId } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import { parseHarnessKind, parseNonEmptyText, parseScopeId, parseSessionKey } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

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

export type { HarnessKind, CompactionId, DecisionId, SessionKey, ScopeId } from '@stateforge-labs/session-ledger';
export function workspaceOfTab(tab: ScopeId): WorkspaceId | null {
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

export type BackendText = Brand<BackendId, 'Text'>;

export const uncheckedMilliseconds = brand<number, 'Milliseconds'>;

export const uncheckedBackendText = brand<BackendId, 'Text'>;

export const uncheckedTabId = brand<string, 'ScopeId'>;

export const uncheckedRatio = brand<number, 'Probability'>;

export const uncheckedPaneId = brand<string, 'SessionKey'>;

export const uncheckedAgentKind = brand<string, 'HarnessKind'>;

export const uncheckedWorkspaceId = brand<string, 'WorkspaceId'>;

export const uncheckedTokenName = brand<string, 'TokenName'>;

export const uncheckedTokenValue = brand<string, 'TokenValue'>;

export { parseCompactionId, parseDecisionId } from '@stateforge-labs/session-ledger';
export const parsePaneId = parseSessionKey;
export const parseTabId = parseScopeId;
export const parseAgentKind = parseHarnessKind;
