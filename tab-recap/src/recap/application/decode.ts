import { paneId, sessionIdFromAgentValue, sessionPathFromAgentValue, tabId } from '#src/recap/domain/ids.ts';
import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import type { SessionIdentity } from '#src/ports/session-identity.ts';

export type Decoded =
    | Observation
    | { readonly kind: 'resync' }
    | { readonly kind: 'unknown'; readonly rawKind: string };

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function nested(data: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
    const value = data[key];
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function field(data: Readonly<Record<string, unknown>>, key: string): string | null {
    return text(data[key]) ?? text(nested(data, 'pane')[key]);
}

export function seenFrom(data: Readonly<Record<string, unknown>>, identity: SessionIdentity): SeenLane | null {
    const pane = field(data, 'pane_id');
    const tab = field(data, 'tab_id');
    const workspace = field(data, 'workspace_id');
    const agent = field(data, 'agent');
    if (pane === null || tab === null || workspace === null || agent === null) {
        return null;
    }
    return {
        paneId: pane,
        tabId: tab,
        workspaceId: workspace,
        agent,
        status: field(data, 'agent_status'),
        session: sessionOf(data, identity),
        cwd: field(data, 'foreground_cwd') ?? field(data, 'cwd'),
        title: field(data, 'terminal_title_stripped'),
    };
}

function agentSessionOf(info: Readonly<Record<string, unknown>>): AgentSession | null {
    const value = text(info['value']);
    if (value === null) {
        return null;
    }
    if (info['kind'] === 'id') {
        return { kind: 'id', value: sessionIdFromAgentValue(value) };
    }
    return info['kind'] === 'path' ? { kind: 'path', value: sessionPathFromAgentValue(value) } : null;
}

export function sessionOf(data: Readonly<Record<string, unknown>>, identity: SessionIdentity): SessionId | null {
    const agent = field(data, 'agent');
    for (const info of [nested(data, 'agent_session'), nested(nested(data, 'pane'), 'agent_session')]) {
        const session = agentSessionOf(info);
        if (session !== null) {
            return identity(agent ?? text(info['agent']) ?? '', session);
        }
    }
    return null;
}

export function paneSessionOf(data: Readonly<Record<string, unknown>>, identity: SessionIdentity): { readonly pane: string; readonly session: string } | null {
    const pane = field(data, 'pane_id');
    const session = sessionOf(data, identity);
    return pane === null || session === null ? null : { pane, session };
}

export function tokensOf(data: Readonly<Record<string, unknown>>): { readonly pane: string; readonly tokens: Readonly<Record<string, string>> } | null {
    const pane = field(data, 'pane_id');
    const raw = nested(data, 'pane')['tokens'] ?? data['tokens'];
    if (pane === null || typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null;
    }
    return { pane, tokens: Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) };
}

const RESYNC = new Set(['pane_created', 'pane_moved', 'tab_closed', 'tab_created', 'layout_updated']);

function decodeKnown(kind: string, data: Readonly<Record<string, unknown>>, identity: SessionIdentity): Decoded | null {
    const pane = field(data, 'pane_id');
    if (kind === 'pane_closed' && pane !== null) {
        return { kind: 'closed', pane: paneId(pane) };
    }
    const status = field(data, 'agent_status');
    if (kind === 'pane_agent_status_changed' && pane !== null && status !== null) {
        return { kind: 'status', pane: paneId(pane), status };
    }
    if (kind === 'pane_agent_detected') {
        const seen = seenFrom(data, identity);
        return seen === null ? { kind: 'resync' } : { kind: 'detected', lane: seen };
    }
    const tab = text(data['tab_id']);
    if (kind === 'tab_focused' && tab !== null) {
        return { kind: 'focused', tab: tabId(tab) };
    }
    return null;
}

export function decode(frame: Frame, identity: SessionIdentity): Decoded {
    const kind = frame.event.replaceAll('.', '_');
    const known = decodeKnown(kind, frame.data, identity);
    if (known !== null) {
        return known;
    }
    return RESYNC.has(kind) ? { kind: 'resync' } : { kind: 'unknown', rawKind: frame.event };
}
