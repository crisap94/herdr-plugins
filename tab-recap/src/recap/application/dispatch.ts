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
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { LaneWeb, TabView, TabViews } from '#src/ports/tab-views.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapJob } from './recap-job.ts';

export interface DispatchDeps {
    readonly columns: Columns;
    readonly views: TabViews;
    readonly visibility: ColumnVisibility;
    readonly recaps: RecapJob;
    readonly prompts: LivePromptSource;
    readonly webs: LaneWebSource;
    /** how full each lane's context is; left out, no lane has a hint */
    readonly contexts?: LaneContextSource;
    /** told, without being awaited, that a lane's agent is idle or done and its context was looked at again (autocompact handles its own errors) */
    settled?(lane: Lane): void;
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

/** What the dispatcher needs of the lanes' context use: what is known, and a way to look again. */
export interface LaneContextSource {
    of(pane: string): ContextUse | null;
    refresh(lane: Lane): Promise<boolean>;
}

/** What the dispatcher needs of the lanes' web contexts: what is known, and a way to look again. */
export interface LaneWebSource {
    of(pane: string): LaneWeb | null;
    refresh(lane: Lane): Promise<boolean>;
}

/** What the view knows of a lane besides the board's own facts, by pane. */
export interface Lookups {
    readonly prompts?: (pane: string) => string | null;
    readonly webs?: (pane: string) => LaneWeb | null;
    readonly contexts?: (pane: string) => ContextUse | null;
}

export function viewOf(board: Board, tab: TabId, at: number, lookups: Lookups = {}): TabView {
    const { prompts = (): null => null, webs = (): null => null, contexts = (): null => null } = lookups;
    return {
        tab: String(tab),
        column: board.columns.get(tab)?.pane ?? null,
        lanes: lanesOf(board, tab).map((lane) => ({
            pane: String(lane.pane), agent: String(lane.agent), status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: prompts(String(lane.pane)), web: webs(String(lane.pane)), context: contexts(String(lane.pane)),
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
                await this.shut(intent.tab, intent.column);
                return;
            case 'publish':
                this.publish(intent.tab);
                return;
            case 'read-prompt':
                await this.look(intent.lane);
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

    /** What a lane shows beside its status — its live prompt, where it lives on the web, how full its context is — looked at again. */
    private async look(lane: Lane): Promise<void> {
        const changed = await Promise.all([this.deps.prompts.refresh(lane), this.deps.webs.refresh(lane), this.deps.contexts?.refresh(lane) ?? false]);
        if (changed.includes(true)) {
            this.publish(lane.tab);
        }
        if (lane.status === 'idle' || lane.status === 'done') {
            this.deps.settled?.(lane);
        }
    }

    private publish(tab: TabId): void {
        this.deps.views.writeTab(viewOf(this.deps.board(), tab, Date.now(), { prompts: (pane) => this.deps.prompts.of(pane), webs: (pane) => this.deps.webs.of(pane), contexts: (pane) => this.deps.contexts?.of(pane) ?? null }));
    }

    private failed(tab: TabId, why: string): void {
        this.deps.log(`tab ${tab}: column not opened (${why})`);
        this.deps.feedback({ kind: 'column-failed', tab });
    }

    private async shut(tab: TabId, pane: PaneId): Promise<void> {
        const done = await this.deps.columns.close(pane);
        if (isUnknown(done)) {
            this.deps.log(`tab ${tab}: column not closed (${pane}, ${saying(done.why)})`);
            this.deps.feedback({ kind: 'column-failed', tab });
        }
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
