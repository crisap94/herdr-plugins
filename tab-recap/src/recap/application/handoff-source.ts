import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { HANDOFF_CLOSED_WINDOW_MS } from './handoff-limits.ts';

export type SourceKind = 'live';

export interface SourceRequest {
    readonly tab: TabId;
    readonly pane: PaneId;
}

export type SourceLane = Pick<Lane, 'pane' | 'tab'>;

export interface SourceDeps {
    readonly lanes: readonly SourceLane[];
    readonly records: Pick<RecapRecords, 'readRecap'>;
    readonly ledger: Pick<Ledger, 'openOf' | 'recentlyClosed'>;
    readonly now: number;
}

export type SourceResolution =
    | { readonly kind: 'found'; readonly task: TaskId; readonly facts: readonly Fact[] }
    | { readonly kind: 'unlisted' }
    | { readonly kind: 'source-unavailable' }
    | { readonly kind: 'task-ambiguous' }
    | { readonly kind: 'unknown'; readonly why: string };

export type SourceResolver = (source: SourceRequest, deps: SourceDeps) => SourceResolution;

export function isLaneOfTab(lanes: readonly SourceLane[], source: SourceRequest): boolean {
    return lanes.some((lane) => lane.pane === source.pane && lane.tab === source.tab);
}

const liveResolver: SourceResolver = (source, deps) => {
    if (!isLaneOfTab(deps.lanes, source)) {
        return { kind: 'source-unavailable' };
    }
    try {
        const listing = (deps.records.readRecap(source.tab)?.tasks ?? []).filter((task) => task.lanes.includes(source.pane));
        if (listing.length > 1) {
            return { kind: 'task-ambiguous' };
        }
        const [only] = listing;
        if (only === undefined) {
            return { kind: 'unlisted' };
        }
        const task: TaskId = { tab: source.tab, key: only.id };
        const open = deps.ledger.openOf(task);
        const closed = deps.ledger.recentlyClosed(task, deps.now - HANDOFF_CLOSED_WINDOW_MS);
        return { kind: 'found', task, facts: [...open, ...closed] };
    } catch (error) {
        return { kind: 'unknown', why: String(error) };
    }
};

export const SOURCE_RESOLVERS: Readonly<Record<SourceKind, SourceResolver>> = {
    live: liveResolver,
};

export function resolveSource(kind: SourceKind, source: SourceRequest, deps: SourceDeps): SourceResolution {
    return SOURCE_RESOLVERS[kind](source, deps);
}
