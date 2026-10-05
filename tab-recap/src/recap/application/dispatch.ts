import { lanesOf } from '#src/recap/domain/board.ts';
import type { Board, Shape } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { edgePane, moveFor, parentSplit, targetCols } from '#src/recap/domain/layout.ts';
import type { Axis } from '#src/recap/domain/layout.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { RecapStore, TabView } from '#src/ports/recap-store.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapJob } from './recap-job.ts';

export interface DispatchDeps {
    readonly columns: Columns;
    readonly store: RecapStore;
    readonly recaps: RecapJob;
    sizing(): Sizing;
    board(): Board;
    feedback(observation: Observation): void;
    log(line: string): void;
}

export function viewOf(board: Board, tab: TabId, at: number): TabView {
    return {
        tab: String(tab),
        column: board.columns.get(tab)?.pane ?? null,
        lanes: lanesOf(board, tab).map((lane) => ({
            pane: String(lane.pane), agent: String(lane.agent), status: lane.status, title: lane.title, cwd: lane.cwd,
        })),
        at,
    };
}

/** A bar is one row of text plus herdr's pane border. */
const BAR_ROWS = 3;

/** Turns intents into port calls. Maps, does not decide: every decision was the fold's. */
export class Dispatch {
    private readonly deps: DispatchDeps;

    constructor(deps: DispatchDeps) {
        this.deps = deps;
    }

    async send(intent: Intent): Promise<void> {
        switch (intent.kind) {
            case 'open-column':
                await this.open(intent.tab, intent.shape);
                return;
            case 'close-column':
                await this.deps.columns.close(intent.column);
                return;
            case 'publish':
                this.deps.store.writeTab(viewOf(this.deps.board(), intent.tab, Date.now()));
                return;
            case 'recap':
                this.deps.recaps.request(intent.tab, intent.lanes, intent.cause);
                return;
            case 'save-hidden':
                this.deps.store.writeHidden(intent.state);
                return;
            case 'give-up':
                this.deps.log(`tab ${intent.tab}: column closed ${intent.reopens}x — left closed for a while`);
                return;
            default: {
                const exhaustive: never = intent;
                this.deps.log(`unhandled intent ${String(exhaustive)}`);
            }
        }
    }

    private failed(tab: TabId, why: string): void {
        this.deps.log(`tab ${tab}: column not opened (${why})`);
        this.deps.feedback({ kind: 'column-failed', tab });
    }

    private async open(tab: TabId, shape: Shape): Promise<void> {
        const layout = await this.deps.columns.layout(tab);
        if (isUnknown(layout)) {
            this.failed(tab, saying(layout.why));
            return;
        }
        const axis: Axis = shape === 'side' ? 'right' : 'up';
        const target = edgePane(layout.panes, axis);
        if (target === null) {
            this.failed(tab, 'the tab has no panes');
            return;
        }
        const opened = await this.deps.columns.open(tab, target.paneId, shape);
        if (isUnknown(opened)) {
            this.failed(tab, saying(opened.why));
            return;
        }
        if (shape === 'bar') {
            await this.lift(opened.pane, target.paneId, layout.focused);
        }
        const cells = shape === 'side' ? targetCols(layout.width, this.deps.sizing()) : BAR_ROWS;
        await this.narrow(tab, opened.pane, axis, cells);
        this.deps.feedback({ kind: 'column-opened', tab, pane: opened.pane, shape });
    }

    /**
     * herdr only splits right or down, so a bar opens BELOW the top pane and is swapped above it.
     * The swap steals focus; it goes straight back — the fold only docks a bar in the focused tab,
     * so this is a hop inside the tab the operator is looking at, never a jump to another tab.
     */
    private async lift(bar: PaneId, top: string, focused: string | null): Promise<void> {
        await this.deps.columns.swap(bar, top);
        await this.deps.columns.focus(focused ?? top);
    }

    private async narrow(tab: TabId, pane: PaneId, axis: Axis, cells: number): Promise<void> {
        const after = await this.deps.columns.layout(tab);
        if (isUnknown(after)) {
            return;
        }
        const rect = after.panes.find((placed) => placed.paneId === String(pane))?.rect;
        const split = rect === undefined ? null : parentSplit(after.splits, rect, axis);
        const move = split === null ? null : moveFor(split, cells, axis);
        if (move !== null) {
            await this.deps.columns.resize(pane, move.direction, move.amount);
        }
    }
}
