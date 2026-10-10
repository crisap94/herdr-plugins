import { agentPanesIn, columnsIn } from './column-panes.ts';
import { seenFrom } from '#src/recap/application/decode.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import type { Placed, Rect, Split } from '#src/recap/domain/layout.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { LayoutResult } from '#src/ports/columns.ts';

type Json = Readonly<Record<string, unknown>>;

export function list(value: unknown): readonly Json[] {
    return Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
}

export function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function rectOf(value: unknown): Rect {
    const r = typeof value === 'object' && value !== null ? (value as Json) : {};
    const n = (key: string): number => (typeof r[key] === 'number' ? r[key] : 0);
    return { x: n('x'), y: n('y'), width: n('width'), height: n('height') };
}

export function reconciliationOf(snapshot: Json): Reconciliation {
    const panes = list(snapshot['panes']);
    const agents = agentPanesIn(panes, list(snapshot['agents']));
    const lanes = list(snapshot['agents']).map((agent) => seenFrom(agent)).filter((lane): lane is SeenLane => lane !== null);
    const widths = new Map(list(snapshot['layouts']).map((layout) => [str(layout['tab_id']), rectOf(layout['area']).width]));
    const focused = str(snapshot['focused_tab_id']);
    return { focusedTab: focused === '' ? null : focused, lanes, panes: panes.map((pane) => str(pane['pane_id'])), columns: columnsIn(panes, agents), widths };
}

export function layoutOf(layout: Json): LayoutResult {
    const panes: Placed[] = list(layout['panes']).map((pane) => ({ paneId: str(pane['pane_id']), rect: rectOf(pane['rect']) }));
    const splits: Split[] = list(layout['splits']).map((split) => ({
        direction: str(split['direction']),
        ratio: typeof split['ratio'] === 'number' ? split['ratio'] : 0.5,
        rect: rectOf(split['rect']),
    }));
    const area = rectOf(layout['area']);
    const focused = str(layout['focused_pane_id']);
    return { kind: 'layout', width: area.width, height: area.height, focused: focused === '' ? null : focused, panes, splits };
}
