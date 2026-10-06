import type { Forge } from './lane-repo.ts';

/** Where a lane's repository lives on the web, and the branch its files are linked on. */
export interface LaneWeb {
    readonly base: string;
    readonly forge: Forge;
    /** null on a detached HEAD */
    readonly branch: string | null;
}

/** What a column renders about one lane of its tab. */
export interface TabLane {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly title: string | null;
    /** where the lane works; null when herdr did not say, or for a view stored before this existed */
    readonly cwd: string | null;
    /** the newest thing the operator typed to this lane (the live prompt); absent or null when unknown, or for a view stored before this existed */
    readonly lastPrompt?: string | null;
    /** the lane's repository on the web; absent or null when it has no `origin` git can turn into one, or for a view stored before this existed */
    readonly web?: LaneWeb | null;
}

export interface TabView {
    readonly tab: string;
    readonly column: string | null;
    readonly lanes: readonly TabLane[];
    readonly at: number;
    /** the plugin version the daemon that wrote this view was started with; null for a view stored before this existed */
    readonly daemonVersion?: string | null;
}

/** The live picture of a tab — its lanes and statuses — that the daemon publishes and a column draws. */
export interface TabViews {
    readTab(tab: string): TabView | null;
    writeTab(view: TabView): void;
}
