import { textOf, parseText, type Text } from '#src/recap/domain/text.ts';
import { paneId, sessionIdFromAgentValue, sessionPathFromAgentValue, tabId } from '#src/recap/domain/ids.ts';
import type { AgentSession, PaneId, SessionId } from '#src/recap/domain/ids.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import type { SessionOf } from '#src/ports/session-identity.ts';

export interface ResyncDecoded {
    readonly kind: 'resync';
}

export interface UnknownDecoded {
    readonly kind: 'unknown';
    readonly rawKind: Text;
}

export type Decoded =
    | Observation
    | ResyncDecoded
    | UnknownDecoded;

export interface JsonObject {
    readonly [key: string]: unknown;
}

export interface PaneSessionRef {
    readonly pane: PaneId;
    readonly session: SessionId;
}

export interface PaneTokenMap {
    readonly pane: PaneId;
    readonly tokens: ReadonlyMap<Text, Text>;
}

type WireKey = 'agent' | 'agent_status' | 'cwd' | 'foreground_cwd' | 'pane_id' | 'tab_id' | 'terminal_title_stripped' | 'value' | 'workspace_id';

type NestedKey = 'agent_session' | 'pane';

const EMPTY: JsonObject = {};

const RESYNC: ReadonlySet<string> = new Set(['pane_created', 'pane_moved', 'tab_closed', 'tab_created', 'layout_updated']);

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textAt(data: JsonObject, key: WireKey): Text | null {
    const value = parseText(data[key]);
    return value.kind === 'ok' && value.value.length > 0 ? value.value : null;
}

function nestedAt(data: JsonObject, key: NestedKey): JsonObject {
    const value = data[key];
    return isJsonObject(value) ? value : EMPTY;
}

function field(data: JsonObject, key: WireKey): Text | null {
    return textAt(data, key) ?? textAt(nestedAt(data, 'pane'), key);
}

export function seenFrom(data: JsonObject, identity: SessionOf): SeenLane | null {
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

function agentSessionOf(info: JsonObject): AgentSession | null {
    const value = textAt(info, 'value');
    if (value === null) {
        return null;
    }
    if (info['kind'] === 'id') {
        return { kind: 'id', value: sessionIdFromAgentValue(textOf(value)) };
    }
    return info['kind'] === 'path' ? { kind: 'path', value: sessionPathFromAgentValue(textOf(value)) } : null;
}

export function sessionOf(data: JsonObject, identity: SessionOf): SessionId | null {
    const agent = field(data, 'agent');
    for (const info of [nestedAt(data, 'agent_session'), nestedAt(nestedAt(data, 'pane'), 'agent_session')]) {
        const session = agentSessionOf(info);
        if (session !== null) {
            return identity(agent ?? textAt(info, 'agent') ?? textOf(''), session);
        }
    }
    return null;
}

export function paneSessionRefOf(data: JsonObject, identity: SessionOf): PaneSessionRef | null {
    const pane = field(data, 'pane_id');
    const session = sessionOf(data, identity);
    return pane === null || session === null ? null : { pane: paneId(pane), session };
}

export function paneTokenMapOf(data: JsonObject): PaneTokenMap | null {
    const pane = field(data, 'pane_id');
    const raw = nestedAt(data, 'pane')['tokens'] ?? data['tokens'];
    if (pane === null || !isJsonObject(raw)) {
        return null;
    }
    const tokens = new Map<Text, Text>();
    for (const [name, value] of Object.entries(raw)) {
        const key = parseText(name);
        const text = parseText(value);
        if (key.kind === 'ok' && text.kind === 'ok') {
            tokens.set(key.value, text.value);
        }
    }
    return { pane: paneId(pane), tokens };
}

function decodeKnown(kind: Text, data: JsonObject, identity: SessionOf): Decoded | null {
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
    const tab = textAt(data, 'tab_id');
    if (kind === 'tab_focused' && tab !== null) {
        return { kind: 'focused', tab: tabId(tab) };
    }
    return null;
}

export function decode(frame: Frame, identity: SessionOf): Decoded {
    const raw = parseText(frame.event);
    const kind = parseText(frame.event.replaceAll('.', '_'));
    if (raw.kind === 'err' || kind.kind === 'err') {
        return { kind: 'resync' };
    }
    const known = decodeKnown(kind.value, frame.data, identity);
    if (known !== null) {
        return known;
    }
    return RESYNC.has(kind.value) ? { kind: 'resync' } : { kind: 'unknown', rawKind: raw.value };
}
