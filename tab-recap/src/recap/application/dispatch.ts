import { lanesOf } from '#src/recap/domain/board.ts';
import { failureCauseOf, parseThrown } from '#src/recap/domain/failure-cause.ts';
import type { Board, Shape } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { workspaceOfTab } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { edgePane, moveFor, parentSplit, targetCols } from '#src/recap/domain/layout.ts';
import type { Axis } from '#src/recap/domain/layout.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { ClosureRecorder } from '#src/ports/closed-lanes.ts';
import type { TabRetirement } from '#src/ports/retention.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { LaneWeb, TabView, TabViews } from '#src/ports/tab-views.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import type { LaneEvents } from './lane-events.ts';
import { countOf, parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';

export type Sharing = 'on' | 'off';

export interface LaneDispatchDeps {
    readonly columns: Columns;
    readonly views: TabViews;
    readonly visibility: ColumnVisibility;
    readonly recaps: Pick<TabRecaps, 'turnEnded' | 'flush'>;
    readonly prompts: PaneSource<Text>;
    readonly webs: PaneSource<LaneWeb>;
    readonly contexts?: PaneSource<ContextUse>;
    readonly closures: ClosureRecorder;
    readonly retirements?: TabRetirement;
    readonly events: LaneEvents;
    readonly sharing: () => Sharing;
    closedDays(): ClosedLaneDays;
    settled?(lane: Lane): void;
    sizing(): Sizing;
    board(): Board;
    feedback(observation: Observation): void;
    log(line: Text): void;
}

export interface PaneSource<Found> {
    of(pane: PaneId): Found | null;
    refresh(lane: Lane): Promise<Presence>;
}

export type ReadPane<Found> = (pane: PaneId) => Found | null;

export interface Lookups {
    readonly prompts?: ReadPane<Text>;
    readonly webs?: ReadPane<LaneWeb>;
    readonly contexts?: ReadPane<ContextUse>;
}

export function viewOf(board: Board, tab: TabId, at: Instant, lookups: Lookups = {}): TabView {
    const { prompts = (): null => null, webs = (): null => null, contexts = (): null => null } = lookups;
    return {
        tab: String(tab),
        column: board.columns.get(tab)?.pane ?? null,
        lanes: lanesOf(board, tab).map((lane) => ({
            pane: String(lane.pane), agent: String(lane.agent), status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: prompts(lane.pane), web: webs(lane.pane), context: contexts(lane.pane), since: lane.since,
        })),
        at,
    };
}

const BAR_ROWS = 3;

export class LaneDispatch {
    private readonly deps: LaneDispatchDeps;

    constructor(deps: LaneDispatchDeps) {
        this.deps = deps;
    }

    async send(intent: Intent): Promise<void> {
        switch (intent.kind) {
            case 'open-column':
                await this.open(intent.tab, intent.shape);
                return;
            case 'close-column':
                this.deps.log(must(parseText(`tab ${intent.tab}: closing column ${intent.column}`)));
                await this.shut(intent.tab, intent.column);
                return;
            case 'publish':
                this.publish(intent.tab);
                return;
            case 'read-prompt':
                await this.look(intent.lane);
                return;
            case 'recap':
                this.deps.recaps.turnEnded(intent.tab, intent.lanes, intent.cause);
                return;
            case 'save-hidden':
                this.deps.visibility.writeHidden(intent.state);
                return;
            case 'give-up':
                this.deps.log(must(parseText(`tab ${intent.tab}: column closed ${intent.reopens}x — left closed for a while`)));
                return;
            case 'lane-closed':
                void this.deps.recaps.flush(intent.closed.tab, 'closed');
                this.keep(intent.closed);
                this.announce(intent.closed);
                return;
            case 'tab-gone':
                this.retire(intent.tab, intent.at);
                return;
            default: {
                const exhaustive: never = intent;
                this.deps.log(must(parseText(`unhandled intent ${String(exhaustive)}`)));
            }
        }
    }

    private announce(closed: ClosedLane): void {
        if (this.deps.sharing() !== 'on') {
            return;
        }
        const workspace = workspaceOfTab(closed.tab);
        if (workspace === null) {
            this.deps.log(must(parseText('lane closure not announced (malformed tab id)')));
            return;
        }
        try {
            this.deps.events.inWorkspace(String(workspace), 'lane-closed', String(closed.pane));
        } catch (error) {
            this.deps.log(must(parseText(`lane ${closed.pane}: closure not announced (${failureCauseOf(parseThrown(error))})`)));
        }
    }

    private retire(tab: TabId, at: Instant): void {
        try {
            if (this.deps.retirements?.retire(tab, at) === 'retired') {
                this.deps.log(must(parseText(`tab ${tab}: gone from herdr, its tasks are retired`)));
            }
        } catch (error) {
            this.deps.log(must(parseText(`tab ${tab}: tasks not retired (${failureCauseOf(parseThrown(error))})`)));
        }
    }

    private keep(closed: ClosedLane): void {
        if (this.deps.closedDays() === 0) {
            return;
        }
        try {
            this.deps.closures.record(closed);
        } catch (error) {
            this.deps.log(must(parseText(`lane ${closed.pane}: closure not recorded (${failureCauseOf(parseThrown(error))})`)));
        }
    }

    private async look(lane: Lane): Promise<void> {
        const changed = await Promise.all([this.deps.prompts.refresh(lane), this.deps.webs.refresh(lane), this.deps.contexts?.refresh(lane) ?? 'absent']);
        if (changed.includes('present')) {
            this.publish(lane.tab);
        }
        if (lane.status === 'idle' || lane.status === 'done') {
            this.deps.settled?.(lane);
        }
    }

    private publish(tab: TabId): void {
        this.deps.views.writeTab(viewOf(this.deps.board(), tab, instant(Date.now()), { prompts: (pane) => this.deps.prompts.of(pane), webs: (pane) => this.deps.webs.of(pane), contexts: (pane) => this.deps.contexts?.of(pane) ?? null }));
    }

    private failed(tab: TabId, why: Text): void {
        this.deps.log(must(parseText(`tab ${tab}: column not opened (${why})`)));
        this.deps.feedback({ kind: 'column-failed', tab });
    }

    private async shut(tab: TabId, pane: PaneId): Promise<void> {
        const done = await this.deps.columns.close(pane);
        if (isUnknown(done)) {
            this.deps.log(must(parseText(`tab ${tab}: column not closed (${pane}, ${saying(done.why)})`)));
            this.deps.feedback({ kind: 'column-failed', tab });
        }
    }

    private async open(tab: TabId, shape: Shape): Promise<void> {
        const layout = await this.deps.columns.layout(tab);
        if (isUnknown(layout)) {
            this.failed(tab, must(parseText(saying(layout.why))));
            return;
        }
        const axis: Axis = shape === 'side' ? 'right' : 'down';
        const target = edgePane(layout.panes, axis);
        if (target === null) {
            this.failed(tab, must(parseText('the tab has no panes')));
            return;
        }
        const opened = await this.deps.columns.open(tab, textOf(target.paneId), shape);
        if (isUnknown(opened)) {
            this.failed(tab, must(parseText(saying(opened.why))));
            return;
        }
        const cells = shape === 'side' ? targetCols(countOf(layout.width), this.deps.sizing()) : BAR_ROWS;
        const counted = parseCount(cells);
        if (counted.kind === 'ok') {
            await this.narrow(tab, opened.pane, axis, counted.value);
        }
        this.deps.log(must(parseText(`tab ${tab}: column opened (${opened.pane}, ${shape})`)));
        this.deps.feedback({ kind: 'column-opened', tab, pane: opened.pane, shape, at: instant(Date.now()) });
    }

    private async narrow(tab: TabId, pane: PaneId, axis: Axis, cells: Count): Promise<void> {
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
