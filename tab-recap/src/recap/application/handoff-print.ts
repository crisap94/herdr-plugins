import { knownOr, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { AgentLookup } from '#src/ports/agents.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { HandoffPrintService, PrintAsk, PrintAnswer } from '#src/ports/handoff-print.ts';
import type { ClosureReader, ClosureRuns } from '#src/ports/closed-lanes.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { TabLaneRecord, TabViewStore } from '#src/ports/tab-views.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { agentKind, tabId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { fsPathOf, type FsPath } from '#src/recap/domain/fs-path.ts';
import { must } from '#src/protocol/result.ts';
import { renderHandoff } from './handoff-pipeline.ts';
import type { HandoffLane } from './handoff-render.ts';
import { resolveSource, unfoundOutcome } from './handoff-source.ts';
import type { ClosedFound, SourceLane, SourceResolution } from './handoff-source.ts';
import { closedLaneOf } from './closed-lane-source.ts';
import type { ClosedView } from './closed-view.ts';
import type { WorksiteDeps } from './worksite-section.ts';

export interface PrintStore {
    readonly ledger: Pick<GuardedLedger, 'openOf' | 'recentlyClosed' | 'allOf'>;
    readonly records: Pick<GuardedRecapRecords, 'readRecap' | 'lastRunOf'>;
    readonly views: Pick<TabViewStore, 'tabOf' | 'readTab'>;
    readonly closures: ClosureReader & ClosureRuns;
    close(): void;
}

interface TargetStatus {
    status(pane: PaneId): Promise<AgentLookup>;
}

export interface PrintDeps {
    readonly openStore: () => PrintStore;
    readonly flush: (tab: TabId, why: 'handoff print') => Promise<void>;
    readonly transcripts: TranscriptRegistry;
    readonly worksite: WorksiteDeps;
    readonly tokens: PaneTokens;
    readonly target: TargetStatus;
    readonly closedDays: ClosedLaneDays;
    readonly now: () => Instant;
    readonly log: (line: Text) => void;
}

const refusedWith = (reason: Extract<HandoffOutcome, { readonly kind: 'refused' }>['reason']): PrintAnswer => ({ kind: 'refused', reason });

const transcriptOf = (cursor: LaneCursor | null): FsPath | null => (cursor === null || cursor.transcript === '' ? null : fsPathOf(cursor.transcript));

const laneOf = (tab: TabId, lane: TabLaneRecord): HandoffLane => ({
    tab,
    pane: lane.pane,
    agent: agentKind(textOf(lane.agent)),
    status: laneStatus(textOf(lane.status)),
    cwd: lane.cwd,
});

interface Live {
    readonly tab: TabId;
    readonly lanes: readonly TabLaneRecord[];
}

interface View {
    readonly lane: HandoffLane;
    readonly cursor: LaneCursor | null;
    readonly facts: readonly Fact[];
    readonly closed: ClosedView | undefined;
}

export class PrintedHandoffs implements HandoffPrintService {
    private readonly deps: PrintDeps;

    constructor(deps: PrintDeps) {
        this.deps = deps;
    }

    async renderForPrint(request: PrintAsk): Promise<PrintAnswer> {
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

    private async printed(store: PrintStore, request: PrintAsk): Promise<PrintAnswer> {
        if (request.closed !== null) {
            return this.closed(store, request, request.closed);
        }
        const tab = store.views.tabOf(request.from);
        if (tab === null) {
            return refusedWith('source-unavailable');
        }
        const tabRef = tab;
        await this.deps.flush(tabRef, 'handoff print');
        const lanes = store.views.readTab(tab)?.lanes ?? [];
        const sourceLanes: readonly SourceLane[] = lanes.map((lane) => ({ tab: tabRef, pane: lane.pane }));
        const found = resolveSource('live', { tab: tabRef, pane: request.from }, { lanes: sourceLanes, records: store.records, ledger: store.ledger, now: this.deps.now() });
        return this.outcome(store, request, found, { tab: tabRef, lanes });
    }

    private async closed(store: PrintStore, request: PrintAsk, identity: ClosedLaneIdentity): Promise<PrintAnswer> {
        await this.deps.flush(identity.tab, 'handoff print');
        const deps = { closures: store.closures, ledger: store.ledger, runs: store.closures, closedDays: this.deps.closedDays, now: instant(this.deps.now()) };
        return this.outcome(store, request, resolveSource('closed', identity, deps), null);
    }

    private async outcome(store: PrintStore, request: PrintAsk, found: SourceResolution, live: Live | null): Promise<PrintAnswer> {
        if (found.kind === 'found') {
            return this.viewed(store, request, found.source === 'closed' ? this.closedView(found) : this.liveView(store, request, found.facts, live));
        }
        if (found.kind === 'unknown') {
            this.deps.log(must(parseText(`handoff print: source unreadable (${found.why})`)));
        }
        return unfoundOutcome(found);
    }

    private liveView(store: PrintStore, request: PrintAsk, facts: readonly Fact[], live: Live | null): View | null {
        const source = live?.lanes.find((lane) => lane.pane === String(request.from));
        if (live === null || source === undefined) {
            return null;
        }
        const cursor = knownOr(store.records.readRecap(tabId(textOf(String(live.tab)))), null)?.lanes.find((lane) => lane.pane === String(request.from)) ?? null;
        return { lane: laneOf(live.tab, source), cursor, facts, closed: undefined };
    }

    private closedView(found: ClosedFound): View {
        return { lane: closedLaneOf(found.identity, found.view), cursor: null, facts: found.facts, closed: found.view };
    }

    private async viewed(store: PrintStore, request: PrintAsk, view: View | null): Promise<PrintAnswer> {
        if (view === null) {
            return refusedWith('source-unavailable');
        }
        const render = renderHandoff({
            records: store.records,
            transcripts: this.deps.transcripts,
            log: this.deps.log,
            locate: (): Promise<FsPath | null> => Promise.resolve(transcriptOf(view.cursor)),
            worksite: this.deps.worksite,
            tokens: this.deps.tokens,
        });
        const result = await render({ handoff: null, at: this.deps.now(), lane: view.lane, cursor: view.cursor, facts: view.facts, note: request.note, refresh: 'not-requested', ...(view.closed === undefined ? {} : { closed: view.closed }) });
        return result.kind === 'text' ? { kind: 'text', text: textOf(result.text), info: await this.targetInfo(request.to) } : result;
    }

    private async targetInfo(to: PaneId | null): Promise<Text | null> {
        if (to === null) {
            return null;
        }
        const state = await this.deps.target.status(to);
        return state.kind === 'agent' ? textOf(`target ${String(to)}: ${state.status}`) : null;
    }
}
