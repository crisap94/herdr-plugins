import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { WindowOf } from '#src/recap/domain/compaction.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { TabLane } from '../tab-views.ts';

export interface AutocompactBriefs {
    put(decisionId: string, brief: string, appended: readonly number[], checked: readonly CheckedFact[], briefedAt: number): void;
    clearBefore(cutoff: number): number;
}

export interface Break {
    readonly kind: BoundaryKind;
    readonly at: number;
    readonly trigger: Trigger | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

export interface Boundaries {
    breaksOf(tab: string): readonly Break[];
    chapterCount(tab: string): number;
    lastBreakAt(tab: TabId, pane: string): number | null;
}

export type Capability<Value, Why extends string> =
    | { readonly kind: 'supported'; readonly value: Value }
    | { readonly kind: 'unsupported'; readonly why: Why };

export const unsupportedCapability = <Why extends string>(why: Why): Capability<never, Why> => ({ kind: 'unsupported', why });

export type Briefed = { readonly kind: 'briefed'; readonly text: string } | Unknown;

export interface CompactionBriefs {
    readonly backend: string;
    readonly job: string;
    write(document: string, correction?: string): Promise<Briefed>;
}

export interface CompactionPlans {
    forKind(rawKind: string, guidance: string): CompactionPlanResult;
}

export interface ConfigPaths {
    readonly configDir: string;
    readonly stateDir: string;
}

export interface ContextWindows {
    windowOf(kind: string): WindowOf;
}

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
