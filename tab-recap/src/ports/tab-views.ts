import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Forge } from './lane-repo.ts';
import type { Unknown } from './unknowable.ts';

export interface LaneWeb {
    readonly base: string;
    readonly forge: Forge;
    readonly branch: string | null;
}

export interface TabLane {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly title: string | null;
    readonly cwd: string | null;
    readonly lastPrompt?: string | null;
    readonly web?: LaneWeb | null;
    readonly context?: ContextUse | null;
    readonly since?: Instant | null;
}

export interface TabView {
    readonly tab: string;
    readonly column: string | null;
    readonly lanes: readonly TabLane[];
    readonly at: number;
    readonly daemonVersion?: string | null;
}

export interface TabViews {
    readTab(tab: string): TabView | null;
    writeTab(view: TabView): void;
    tabOf(pane: string): string | null;
}

export type LiveLanesRead = { readonly kind: 'read'; readonly lanes: readonly RestoredLane[] } | Unknown;

export interface LiveLanes {
    liveLanes(): LiveLanesRead;
}
