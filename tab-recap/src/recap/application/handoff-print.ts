import type { AgentState } from '#src/ports/agents.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { HandoffPrinter, PrintRequest, PrintResult } from '#src/ports/handoff-print.ts';
import type { ClosureReader, ClosureRuns } from '#src/ports/closed-lanes.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import type { TabLane, TabViews } from '#src/ports/tab-views.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { instant } from '#src/recap/domain/time.ts';
import { renderHandoff } from './handoff-pipeline.ts';
import type { HandoffLane } from './handoff-render.ts';
import { resolveSource } from './handoff-source.ts';
import type { SourceLane, SourceResolution } from './handoff-source.ts';
import { closedLaneOf } from './closed-lane-source.ts';
import type { ClosedView } from './closed-view.ts';
import type { WorksiteDeps } from './worksite-section.ts';

export interface PrintStore {
    readonly ledger: Pick<Ledger, 'openOf' | 'recentlyClosed' | 'allOf'>;
    readonly records: Pick<RecapRecords, 'readRecap' | 'lastRunOf'>;
    readonly views: Pick<TabViews, 'tabOf' | 'readTab'>;
    readonly closures: ClosureReader & ClosureRuns;
    close(): void;
}

export interface PrintDeps {
    readonly openStore: () => PrintStore;
    readonly transcripts: TranscriptRegistry;
    readonly worksite: WorksiteDeps;
    readonly tokens: PaneTokens;
    readonly target: { status(pane: string): Promise<AgentState> };
    readonly closedDays: ClosedLaneDays;
    readonly now: () => number;
}

const refusedWith = (reason: Extract<HandoffOutcome, { readonly kind: 'refused' }>['reason']): PrintResult => ({ kind: 'refused', reason });

const transcriptOf = (cursor: LaneCursor | null): string | null => (cursor === null || cursor.transcript === '' ? null : cursor.transcript);

const laneOf = (tab: TabId, lane: TabLane): HandoffLane => ({
    tab,
    pane: paneId(lane.pane),
    agent: agentKind(lane.agent),
    status: laneStatus(lane.status),
    cwd: lane.cwd,
});

interface Live {
    readonly tab: TabId;
    readonly lanes: readonly TabLane[];
}

interface View {
    readonly lane: HandoffLane;
    readonly cursor: LaneCursor | null;
    readonly facts: readonly Fact[];
    readonly closed: ClosedView | undefined;
}

export class PrintedHandoffs implements HandoffPrinter {
    private readonly deps: PrintDeps;

    constructor(deps: PrintDeps) {
        this.deps = deps;
    }

    async renderForPrint(request: PrintRequest): Promise<PrintResult> {
        if (request.closed === null && request.to === request.from) {
            return refusedWith('source-equals-target');
        }
        const store = this.deps.openStore();
        try {
            return await this.printed(store, request);
        } finally {
            store.close();
        }
    }

    private async printed(store: PrintStore, request: PrintRequest): Promise<PrintResult> {
        if (request.closed !== null) {
            return this.closed(store, request, request.closed);
        }
        const tab = store.views.tabOf(String(request.from));
        if (tab === null) {
            return refusedWith('source-unavailable');
        }
        const tabRef = tabId(tab);
        const lanes = store.views.readTab(tab)?.lanes ?? [];
        const sourceLanes: readonly SourceLane[] = lanes.map((lane) => ({ tab: tabRef, pane: paneId(lane.pane) }));
        const found = resolveSource('live', { tab: tabRef, pane: request.from }, { lanes: sourceLanes, records: store.records, ledger: store.ledger, now: this.deps.now() });
        return this.outcome(store, request, found, { tab: tabRef, lanes });
    }

    private closed(store: PrintStore, request: PrintRequest, identity: ClosedLaneIdentity): Promise<PrintResult> {
        const deps = { closures: store.closures, ledger: store.ledger, runs: store.closures, closedDays: this.deps.closedDays, now: instant(this.deps.now()) };
        return this.outcome(store, request, resolveSource('closed', identity, deps), null, identity);
    }

    private async outcome(store: PrintStore, request: PrintRequest, found: SourceResolution, live: Live | null, identity?: ClosedLaneIdentity): Promise<PrintResult> {
        switch (found.kind) {
            case 'found':
                return this.viewed(store, request, found.view === undefined ? this.liveView(store, request, found.facts, live) : this.closedView(identity, found.facts, found.view));
            case 'unlisted':
                return refusedWith('ledger-empty');
            case 'task-ambiguous':
                return refusedWith('task-ambiguous');
            case 'source-unavailable':
                return refusedWith('source-unavailable');
            case 'unknown':
                return { kind: 'failed', reason: 'source-unreadable' };
            default: {
                const exhaustive: never = found;
                return exhaustive;
            }
        }
    }

    private liveView(store: PrintStore, request: PrintRequest, facts: readonly Fact[], live: Live | null): View | null {
        const source = live?.lanes.find((lane) => lane.pane === String(request.from));
        if (live === null || source === undefined) {
            return null;
        }
        const cursor = store.records.readRecap(String(live.tab))?.lanes.find((lane) => lane.pane === String(request.from)) ?? null;
        return { lane: laneOf(live.tab, source), cursor, facts, closed: undefined };
    }

    private closedView(identity: ClosedLaneIdentity | undefined, facts: readonly Fact[], view: ClosedView): View | null {
        if (identity === undefined) {
            return null;
        }
        return { lane: closedLaneOf(identity, view), cursor: null, facts, closed: view };
    }

    private async viewed(store: PrintStore, request: PrintRequest, view: View | null): Promise<PrintResult> {
        if (view === null) {
            return refusedWith('source-unavailable');
        }
        const render = renderHandoff({
            records: store.records,
            transcripts: this.deps.transcripts,
            locate: (): Promise<string | null> => Promise.resolve(transcriptOf(view.cursor)),
            worksite: this.deps.worksite,
            tokens: this.deps.tokens,
        });
        const result = await render({ handoff: null, at: this.deps.now(), lane: view.lane, cursor: view.cursor, facts: view.facts, note: request.note, refresh: 'not-requested', ...(view.closed === undefined ? {} : { closed: view.closed }) });
        return result.kind === 'text' ? { kind: 'text', text: result.text, info: await this.targetInfo(request.to) } : result;
    }

    private async targetInfo(to: PaneId | null): Promise<string | null> {
        if (to === null) {
            return null;
        }
        const state = await this.deps.target.status(String(to));
        return state.kind === 'agent' ? `target ${String(to)}: ${state.status}` : null;
    }
}
