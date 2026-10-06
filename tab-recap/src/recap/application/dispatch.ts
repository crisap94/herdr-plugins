import { lanesOf } from '#src/recap/domain/board.ts';
import type { Board, Shape } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { edgePane, moveFor, parentSplit, targetCols } from '#src/recap/domain/layout.ts';
import type { Axis } from '#src/recap/domain/layout.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabView, TabViews } from '#src/ports/tab-views.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapJob } from './recap-job.ts';

export interface DispatchDeps {
    readonly columns: Columns;
    readonly views: TabViews;
    readonly visibility: ColumnVisibility;
    readonly recaps: RecapJob;
    readonly prompts: LivePromptSource;
    sizing(): Sizing;
    board(): Board;
    feedback(observation: Observation): void;
    log(line: string): void;
}

/** What the dispatcher needs of the live prompts: what is known, and a way to look again. */
export interface LivePromptSource {
    of(pane: string): string | null;
    refresh(lane: Lane): Promise<boolean>;
}

export function viewOf(board: Board, tab: TabId, at: number, prompts: (pane: string) => string | null = (): null => null): TabView {
    return {
        tab: String(tab),
        column: board.columns.get(tab)?.pane ?? null,
        lanes: lanesOf(board, tab).map((lane) => ({
            pane: String(lane.pane), agent: String(lane.agent), status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: prompts(String(lane.pane)),
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
                this.deps.log(`tab ${intent.tab}: closing column ${intent.column}`);
                await this.deps.columns.close(intent.column);
                return;
            case 'publish':
                this.publish(intent.tab);
                return;
            case 'read-prompt':
                if (await this.deps.prompts.refresh(intent.lane)) {
                    this.publish(intent.lane.tab);
                }
                return;
            case 'recap':
                this.deps.recaps.request(intent.tab, intent.lanes, intent.cause);
                return;
            case 'save-hidden':
                this.deps.visibility.writeHidden(intent.state);
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

    private publish(tab: TabId): void {
        this.deps.views.writeTab(viewOf(this.deps.board(), tab, Date.now(), (pane) => this.deps.prompts.of(pane)));
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
        const axis: Axis = shape === 'side' ? 'right' : 'down';
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
        const cells = shape === 'side' ? targetCols(layout.width, this.deps.sizing()) : BAR_ROWS;
        await this.narrow(tab, opened.pane, axis, cells);
        this.deps.log(`tab ${tab}: column opened (${opened.pane}, ${shape})`);
        this.deps.feedback({ kind: 'column-opened', tab, pane: opened.pane, shape, at: Date.now() });
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
