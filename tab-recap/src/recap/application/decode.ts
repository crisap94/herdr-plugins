import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { Frame } from '#src/ports/fleet-source.ts';

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

/** herdr's frames carry the pane either flat or under `pane`. */
function field(data: Readonly<Record<string, unknown>>, key: string): string | null {
    return text(data[key]) ?? text(nested(data, 'pane')[key]);
}

export function seenFrom(data: Readonly<Record<string, unknown>>): SeenLane | null {
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
        session: text(nested(data, 'agent_session')['value']) ?? text(nested(nested(data, 'pane'), 'agent_session')['value']),
        cwd: field(data, 'foreground_cwd') ?? field(data, 'cwd'),
        title: field(data, 'terminal_title_stripped'),
    };
}

/** Structural changes: re-read the snapshot. `layout_updated` is how a phone attaching (a narrower tab) is noticed. */
const RESYNC = new Set(['pane_created', 'pane_moved', 'tab_closed', 'tab_created', 'layout_updated']);

function decodeKnown(kind: string, data: Readonly<Record<string, unknown>>): Decoded | null {
    const pane = field(data, 'pane_id');
    if (kind === 'pane_closed' && pane !== null) {
        return { kind: 'closed', pane: paneId(pane) };
    }
    const status = field(data, 'agent_status');
    if (kind === 'pane_agent_status_changed' && pane !== null && status !== null) {
        return { kind: 'status', pane: paneId(pane), status };
    }
    if (kind === 'pane_agent_detected') {
        const seen = seenFrom(data);
        return seen === null ? { kind: 'resync' } : { kind: 'detected', lane: seen };
    }
    const tab = text(data['tab_id']);
    if (kind === 'tab_focused' && tab !== null) {
        return { kind: 'focused', tab: tabId(tab) };
    }
    return null;
}

/** herdr names emitted events with underscores and subscriptions with dots: accept both. */
export function decode(frame: Frame): Decoded {
    const kind = frame.event.replaceAll('.', '_');
    const known = decodeKnown(kind, frame.data);
    if (known !== null) {
        return known;
    }
    return RESYNC.has(kind) ? { kind: 'resync' } : { kind: 'unknown', rawKind: frame.event };
}
