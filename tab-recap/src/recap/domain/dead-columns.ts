import { put, without } from './board.ts';
import type { Board } from './board.ts';
import type { PaneId } from './ids.ts';
import type { Intent } from './intent.ts';
import type { DeadColumn, Reconciliation } from './legacy.ts';
import { spend } from './policy.ts';
import type { Policy } from './policy.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export type { DeadColumn } from './legacy.ts';

export interface DeadColumnsStep { readonly board: Board; readonly intents: readonly Intent[] }

function closedDead(board: Board, dead: DeadColumn, now: Instant, policy: Policy): DeadColumnsStep {
    const closing: Board = { ...board, closing: put(board.closing, dead.pane, now) };
    const close: Intent = { kind: 'close-column', tab: dead.tab, column: dead.pane };
    if (board.columns.get(dead.tab)?.pane !== dead.pane) {
        return { board: closing, intents: [close] };
    }
    const [spent, intents] = spend({ ...closing, columns: without(closing.columns, dead.tab) }, dead.tab, now, policy);
    return { board: spent, intents: [close, ...intents] };
}

export function deadColumnsAfter(board: Board, seen: Reconciliation, now: Instant, policy: Policy): DeadColumnsStep {
    const alive = new Set<string>(seen.panes);
    const agents = new Set<string>(seen.lanes.map((lane) => lane.paneId));
    const titled = new Set<string>(seen.columns.map((column) => column.paneId));
    const placedPanes = new Set<PaneId>([...board.columns.values()].map((placed) => placed.pane));
    const fromBoard: DeadColumn[] = [...board.columns]
        .filter(([, placed]) => alive.has(placed.pane) && !agents.has(placed.pane) && !titled.has(placed.pane) && !board.closing.has(placed.pane) && (placed.since === undefined || now - placed.since >= policy.closeGrace))
        .map(([tab, placed]) => ({ tab, pane: placed.pane }));
    const fromSeen = (seen.dead ?? []).filter((dead) =>
        alive.has(dead.pane) && !agents.has(dead.pane) && !board.closing.has(dead.pane) && !placedPanes.has(dead.pane) && !board.opening.has(dead.tab));
    const unique = [...new Map([...fromBoard, ...fromSeen].map((dead) => [dead.pane, dead])).values()];
    return unique.reduce<DeadColumnsStep>((held, dead) => {
        const next = closedDead(held.board, dead, now, policy);
        return { board: next.board, intents: [...held.intents, ...next.intents] };
    }, { board, intents: [] });
}
