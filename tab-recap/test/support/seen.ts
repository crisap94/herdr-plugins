import { allHiddenOf, enabledOf, seededOf } from '#src/recap/domain/board.ts';
import type { HiddenState, Seeded, Shape } from '#src/recap/domain/board.ts';
import { countOf } from '#src/recap/domain/count.ts';
import type { DeadColumn } from '#src/recap/domain/dead-columns.ts';
import type { ColumnOpenedObservation, Reconciliation, SeenColumn, SessionObservation, StatusObservation, SwitchedObservation } from '#src/recap/domain/fold.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';

export interface BareLane {
    readonly paneId: string;
    readonly tabId: string;
    readonly workspaceId: string;
    readonly agent: string;
    readonly status?: string | null | undefined;
    readonly session?: string | null | undefined;
    readonly cwd?: string | null | undefined;
    readonly title?: string | null | undefined;
}

interface BareColumn { readonly tabId: string; readonly paneId: string; readonly shape: Shape; }

interface BareReconciliation {
    readonly focusedTab?: string | null;
    readonly at?: number;
    readonly lanes: readonly SeenLane[];
    readonly panes: readonly string[];
    readonly columns: readonly BareColumn[];
    readonly widths: ReadonlyMap<string, number>;
    readonly tabs?: readonly TabId[];
    readonly dead?: readonly DeadColumn[];
}

const optionalText = (raw: string | null | undefined): SeenLane['status'] => (raw === null || raw === undefined ? raw : textOf(raw));

export const seenLane = (bare: BareLane): SeenLane => ({
    paneId: textOf(bare.paneId),
    tabId: textOf(bare.tabId),
    workspaceId: textOf(bare.workspaceId),
    agent: textOf(bare.agent),
    ...(bare.status === undefined ? {} : { status: optionalText(bare.status) }),
    ...(bare.session === undefined ? {} : { session: optionalText(bare.session) }),
    ...(bare.cwd === undefined ? {} : { cwd: optionalText(bare.cwd) }),
    ...(bare.title === undefined ? {} : { title: optionalText(bare.title) }),
});

export const seenColumn = (bare: BareColumn): SeenColumn => ({ tabId: textOf(bare.tabId), paneId: textOf(bare.paneId), shape: bare.shape });

export const reconciliation = (bare: BareReconciliation): Reconciliation => ({
    lanes: bare.lanes,
    panes: bare.panes.map((pane) => textOf(pane)),
    columns: bare.columns.map(seenColumn),
    widths: new Map([...bare.widths].map(([tab, width]) => [textOf(tab), countOf(width)])),
    ...(bare.focusedTab === undefined ? {} : { focusedTab: bare.focusedTab === null ? null : textOf(bare.focusedTab) }),
    ...(bare.at === undefined ? {} : { at: instant(bare.at) }),
    ...(bare.tabs === undefined ? {} : { tabs: bare.tabs }),
    ...(bare.dead === undefined ? {} : { dead: bare.dead }),
});

export const statusObservation = (bare: { readonly kind: 'status'; readonly pane: PaneId; readonly status: string }): StatusObservation => ({ kind: 'status', pane: bare.pane, status: textOf(bare.status) });

export const sessionObservation = (bare: { readonly kind: 'session'; readonly pane: PaneId; readonly session: string }): SessionObservation => ({ kind: 'session', pane: bare.pane, session: textOf(bare.session) });

export const columnOpenedObservation = (bare: { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape; readonly at?: number }): ColumnOpenedObservation => ({
    kind: 'column-opened', tab: bare.tab, pane: bare.pane, shape: bare.shape, ...(bare.at === undefined ? {} : { at: instant(bare.at) }),
});

export const switchedObservation = (bare: { readonly kind: 'switched'; readonly enabled: boolean }): SwitchedObservation => ({ kind: 'switched', enabled: enabledOf(bare.enabled) });

export const boardSeeded = (value: boolean): Seeded => seededOf(value);

export const hiddenStateOf = (bare: { readonly all: boolean; readonly hidden: readonly string[]; readonly shown: readonly string[] }): HiddenState => ({
    all: allHiddenOf(bare.all), hidden: bare.hidden.map((tab) => textOf(tab)), shown: bare.shown.map((tab) => textOf(tab)),
});
