import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Forge } from './lane-repo.ts';

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
}
