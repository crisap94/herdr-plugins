import type { AgentState } from '#src/ports/agents.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { HandoffPrinter, PrintRequest, PrintResult } from '#src/ports/handoff-print.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import type { TabLane, TabViews } from '#src/ports/tab-views.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { renderHandoff } from './handoff-pipeline.ts';
import type { HandoffLane } from './handoff-render.ts';
import { resolveSource } from './handoff-source.ts';
import type { SourceLane } from './handoff-source.ts';
import type { WorksiteDeps } from './worksite-section.ts';

export interface PrintStore {
    readonly ledger: Pick<Ledger, 'openOf' | 'recentlyClosed'>;
    readonly records: Pick<RecapRecords, 'readRecap' | 'lastRunOf'>;
    readonly views: Pick<TabViews, 'tabOf' | 'readTab'>;
    close(): void;
}

export interface PrintDeps {
    readonly openStore: () => PrintStore;
    readonly transcripts: TranscriptRegistry;
    readonly worksite: WorksiteDeps;
    readonly tokens: PaneTokens;
    readonly target: { status(pane: string): Promise<AgentState> };
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

export class PrintedHandoffs implements HandoffPrinter {
    private readonly deps: PrintDeps;

    constructor(deps: PrintDeps) {
        this.deps = deps;
    }

    async renderForPrint(request: PrintRequest): Promise<PrintResult> {
        if (request.to === request.from) {
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
        const tab = store.views.tabOf(String(request.from));
        if (tab === null) {
            return refusedWith('source-unavailable');
        }
        const tabRef = tabId(tab);
        const lanes = store.views.readTab(tab)?.lanes ?? [];
        const sourceLanes: readonly SourceLane[] = lanes.map((lane) => ({ tab: tabRef, pane: paneId(lane.pane) }));
        const found = resolveSource('live', { tab: tabRef, pane: request.from }, { lanes: sourceLanes, records: store.records, ledger: store.ledger, now: this.deps.now() });
        switch (found.kind) {
            case 'found':
                return this.rendered(store, { tab: tabRef, lanes, request, facts: found.facts });
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

    private async rendered(store: PrintStore, view: { readonly tab: TabId; readonly lanes: readonly TabLane[]; readonly request: PrintRequest; readonly facts: readonly Fact[] }): Promise<PrintResult> {
        const source = view.lanes.find((lane) => lane.pane === String(view.request.from));
        if (source === undefined) {
            return refusedWith('source-unavailable');
        }
        const cursor = store.records.readRecap(String(view.tab))?.lanes.find((lane) => lane.pane === String(view.request.from)) ?? null;
        const render = renderHandoff({
            records: store.records,
            transcripts: this.deps.transcripts,
            locate: (): Promise<string | null> => Promise.resolve(transcriptOf(cursor)),
            worksite: this.deps.worksite,
            tokens: this.deps.tokens,
        });
        const result = await render({ handoff: null, at: this.deps.now(), lane: laneOf(view.tab, source), cursor, facts: view.facts, note: view.request.note, refresh: 'not-requested' });
        return result.kind === 'text' ? { kind: 'text', text: result.text, info: await this.targetInfo(view.request.to) } : result;
    }

    private async targetInfo(to: PaneId | null): Promise<string | null> {
        if (to === null) {
            return null;
        }
        const state = await this.deps.target.status(String(to));
        return state.kind === 'agent' ? `target ${String(to)}: ${state.status}` : null;
    }
}
