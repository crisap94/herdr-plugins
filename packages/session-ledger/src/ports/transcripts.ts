import type { Observed } from '#src/recap/domain/compaction.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { BackgroundItem, RunningCount } from '#src/recap/domain/in-flight.ts';
import type { AgentKind, Lane } from '#src/recap/domain/lane-shape.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { InFlightWhy, SplitWhy } from './capability-reasons.ts';
import type { Unknown } from './unknowable.ts';

export type CallKind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';

export interface Entry { readonly role: 'user' | 'agent' | 'tool'; readonly text: Text; readonly at?: Instant; readonly queued?: boolean; readonly kind?: CallKind; readonly what?: Text; }

export interface AgentNote { readonly kind: 'away_summary' | 'compaction'; readonly at: Instant | null; readonly text: Text; }

export type Cursor = Brand<number, 'Cursor'>;

export const cursorOf = brand<number, 'Cursor'>;

export interface Position { readonly cursor: Cursor; readonly tail: Text | null; }

export interface Mark { readonly kind: 'compacted' | 'compaction-failed'; readonly at: Instant | null; readonly tokensBefore?: Count; readonly tokensAfter?: Count; readonly tookMs?: Duration; readonly trigger?: 'auto' | 'manual'; }

export type Grew = Brand<boolean, 'Grew'>;

export const grewOf = brand<boolean, 'Grew'>;

export interface Chunk { readonly kind: 'chunk'; readonly entries: readonly Entry[]; readonly title: Text | null; readonly lastPrompt: Text | null; readonly claudeRecap: Text | null; readonly notes: readonly AgentNote[]; readonly marks?: readonly Mark[]; readonly position: Position; readonly grew: Grew; readonly more?: boolean; }

export type SourcePath = Brand<string, 'SourcePath'>;

export const sourcePathOf = brand<string, 'SourcePath'>;

export const UNREAD: Position = { cursor: cursorOf(0), tail: null };

export type Located = { readonly kind: 'located'; readonly source: SourcePath } | Unknown;

export type PromptResult = { readonly kind: 'prompt'; readonly text: Text | null } | Unknown;

export type InFlightResult = { readonly kind: 'in-flight'; readonly count: RunningCount; readonly background: readonly BackgroundItem[] } | Unknown;

export type ChunkResult = Chunk | Unknown;

export type ObservedResult = { readonly kind: 'observed'; readonly observed: Observed | null } | Unknown;

export type BackgroundSplit = { readonly kind: 'separates' } | { readonly kind: 'foreground-only'; readonly why: SplitWhy };

export type InFlightCapability =
    | { readonly kind: 'supported'; readonly split: BackgroundSplit; readonly read: (source: SourcePath, budget: Count) => Promise<InFlightResult> }
    | { readonly kind: 'unsupported'; readonly why: InFlightWhy };

export type SupportedInFlight = Extract<InFlightCapability, { readonly kind: 'supported' }>;

export interface SessionReader {
    readonly agent: AgentKind;
    locate(lane: Lane): Promise<Located>;
    read(source: SourcePath, was: Position, budget: Count): Promise<ChunkResult>;
    carry?(from: Located, to: Located, at: Position): Promise<Position>;
    latestPrompt(source: SourcePath, budget: Count): Promise<PromptResult>;
    observed?(source: SourcePath, budget: Count): Promise<ObservedResult>;
    readonly inFlight: InFlightCapability;
}
