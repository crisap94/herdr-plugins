import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import type { AgentKind, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Forge } from '@stateforge-labs/session-ledger/unstable/ports/lane-repo.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { LaneWeb, TabLane, TabView, TabViews } from './twins/legacy.ts';

export interface LaneWebRecord {
    readonly base: Text;
    readonly forge: Forge;
    readonly branch: Text | null;
}

export interface TabLaneRecord {
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly status: Text;
    readonly title: Text | null;
    readonly cwd: Text | null;
    readonly lastPrompt?: Text | null;
    readonly web?: LaneWebRecord | null;
    readonly context?: ContextUse | null;
    readonly since?: Instant | null;
}

export interface TabViewRecord {
    readonly tab: TabId;
    readonly column: Text | null;
    readonly lanes: readonly TabLaneRecord[];
    readonly at: Instant;
    readonly daemonVersion?: Text | null;
}

export interface TabViewStore {
    readTab(tab: TabId): TabViewRecord | null;
    writeTab(view: TabViewRecord): void;
    tabOf(pane: PaneId): TabId | null;
}

export type LiveLanesRead = { readonly kind: 'read'; readonly lanes: readonly RestoredLane[] } | Unknown;

export interface LiveLanes {
    liveLanes(): LiveLanesRead;
}
