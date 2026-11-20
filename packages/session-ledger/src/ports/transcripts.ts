import type { Observed } from '#src/recap/domain/compaction.ts';
import type { SplitWhy } from './capability-reasons.ts';
import type { Chunk, InFlightCapability, Position } from './legacy.ts';
import type { Unknown } from './unknowable.ts';

export type { AgentNote, Chunk, Entry, InFlightCapability, InFlightResult, Located, Mark, Position, PromptResult, Transcripts } from './legacy.ts';

export type CallKind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';

export const UNREAD: Position = { cursor: 0, tail: null };

export type ChunkResult = Chunk | Unknown;

export type ObservedResult = { readonly kind: 'observed'; readonly observed: Observed | null } | Unknown;

export type BackgroundSplit = { readonly kind: 'separates' } | { readonly kind: 'foreground-only'; readonly why: SplitWhy };

export type SupportedInFlight = Extract<InFlightCapability, { readonly kind: 'supported' }>;
