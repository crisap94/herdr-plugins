import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { HANDOFF_CLOSED_WINDOW_MS } from './handoff-limits.ts';
import { resolveClosedLane } from './closed-lane-source.ts';
import type { ClosedSourceDeps } from './closed-lane-source.ts';
import type { ClosedView } from './closed-view.ts';
import { saying } from '#src/ports/unknowable.ts';

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

interface FoundFacts {
    readonly kind: 'found';
    readonly task: TaskId;
    readonly facts: readonly Fact[];
}

export interface LiveFound extends FoundFacts {
    readonly source: 'live';
}

export interface ClosedFound extends FoundFacts {
    readonly source: 'closed';
    readonly identity: ClosedLaneIdentity;
    readonly view: ClosedView;
}

export type FoundSource = LiveFound | ClosedFound;

export type SourceResolution =
    | FoundSource
    | { readonly kind: 'unlisted' }
    | { readonly kind: 'source-unavailable' }
    | { readonly kind: 'task-ambiguous' }
    | { readonly kind: 'unknown'; readonly why: string };

export interface SourceInputs {
    readonly live: { readonly request: SourceRequest; readonly deps: SourceDeps };
    readonly closed: { readonly request: ClosedLaneIdentity; readonly deps: ClosedSourceDeps };
}

export type SourceKind = keyof SourceInputs;

export type SourceResolver<K extends SourceKind> = (source: SourceInputs[K]['request'], deps: SourceInputs[K]['deps']) => SourceResolution;

export function isLaneOfTab(lanes: readonly SourceLane[], source: SourceRequest): boolean {
    return lanes.some((lane) => lane.pane === source.pane && lane.tab === source.tab);
}

const liveResolver: SourceResolver<'live'> = (source, deps) => {
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
        return { kind: 'found', source: 'live', task, facts: [...open, ...closed] };
    } catch (error) {
        return { kind: 'unknown', why: String(error) };
    }
};

const closedResolver: SourceResolver<'closed'> = (identity, deps): SourceResolution => {
    const resolution = resolveClosedLane(identity, deps);
    switch (resolution.kind) {
        case 'found':
            return { kind: 'found', source: 'closed', identity, task: resolution.task, facts: resolution.facts, view: resolution.view };
        case 'unknown':
            return { kind: 'unknown', why: saying(resolution.why) };
        default:
            return { kind: 'source-unavailable' };
    }
};

export const SOURCE_RESOLVERS: { readonly [K in SourceKind]: SourceResolver<K> } = {
    live: liveResolver,
    closed: closedResolver,
};

export function resolveSource<K extends SourceKind>(kind: K, source: SourceInputs[K]['request'], deps: SourceInputs[K]['deps']): SourceResolution {
    return SOURCE_RESOLVERS[kind](source, deps);
}
