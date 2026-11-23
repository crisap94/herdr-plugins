import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { Forge } from '@stateforge-labs/session-ledger/unstable/ports/lane-repo.ts';

export type Capability<Value, Why extends string> =
    | { readonly kind: 'supported'; readonly value: Value }
    | { readonly kind: 'unsupported'; readonly why: Why };

export const unsupportedCapability = <Why extends string>(why: Why): Capability<never, Why> => ({ kind: 'unsupported', why });

export interface Note {
    readonly label: string;
    readonly at: number | null;
    readonly details: readonly string[];
    readonly mark?: string;
}

export type NotesResult = { readonly kind: 'notes'; readonly byPane: ReadonlyMap<string, readonly Note[]> } | Unknown;

export interface Extension {
    readonly id: string;
    notes?(lanes?: readonly TabLane[], locale?: Locale): NotesResult;
    warning?(locale: Locale): string | null;
}

export interface Topic {
    readonly type: string;
    readonly pane_id?: string;
}

export interface Frame {
    readonly event: string;
    readonly data: Readonly<Record<string, unknown>>;
}

export type SnapshotResult = { readonly kind: 'snapshot'; readonly seen: Reconciliation; readonly focusedTab: string | null; readonly paneTokens: ReadonlyMap<string, TokenMap> } | Unknown;

export interface FrameStream {
    frames(): AsyncIterable<Frame>;
    close(): void;
}

export type StreamResult = { readonly kind: 'stream'; readonly stream: FrameStream } | Unknown;

export interface FleetSource {
    snapshot(): Promise<SnapshotResult>;
    subscribe(topics: readonly Topic[]): Promise<StreamResult>;
}

export interface StoredRun {
    readonly id: string;
    readonly tab: string;
    readonly at: number;
    readonly language: string;
    readonly backend: string | null;
    readonly hasInput: boolean;
    readonly gateStats: GateStats | null;
}

export interface RunItem {
    readonly key: string;
    readonly section: string;
    readonly text: string;
    readonly fact: string;
    readonly born: boolean;
    readonly anchor: string | null;
}

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

export interface CompactionTokens {
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly origin: Origin;
}

export interface SessionSource {
    firstSeen(tab: string): number | null;
    runsByCause(tab: string): Readonly<Record<string, number>>;
    compactions(tab: string): readonly CompactionTokens[];
}
