import { brand } from '../recap/domain/brand.ts';
import type { Brand, Count, Duration, Instant, Text, Unknown } from './kernel.ts';
import type { Directory, HarnessKind, SessionId, SessionKey } from './ids.ts';

export interface FollowedSession {
    readonly key: SessionKey;
    readonly harness: HarnessKind;
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
    readonly title: Text | null;
}
export type RecapCause = 'turn-ended' | 'focused' | 'requested';

export type CallKind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';

export interface Entry {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: Text;
    readonly at?: Instant;
    readonly queued?: boolean;
    readonly kind?: CallKind;
    readonly what?: Text;
}

export interface AgentNote {
    readonly kind: 'away_summary' | 'compaction';
    readonly at: Instant | null;
    readonly text: Text;
}

export type Cursor = Brand<number, 'Cursor'>;

export interface Position {
    readonly cursor: Cursor;
    readonly tail: Text | null;
}

export const UNREAD: Position = { cursor: brand<number, 'Cursor'>(0), tail: null };

export interface Mark {
    readonly kind: 'compacted' | 'compaction-failed';
    readonly at: Instant | null;
    readonly tokensBefore?: Count;
    readonly tokensAfter?: Count;
    readonly tookMs?: Duration;
    readonly trigger?: 'auto' | 'manual';
}

export type Grew = Brand<boolean, 'Grew'>;

export interface Chunk {
    readonly kind: 'chunk';
    readonly entries: readonly Entry[];
    readonly title: Text | null;
    readonly lastPrompt: Text | null;
    readonly harnessRecap: Text | null;
    readonly notes: readonly AgentNote[];
    readonly marks?: readonly Mark[];
    readonly position: Position;
    readonly grew: Grew;
    readonly more?: boolean;
}

export type SourcePath = Brand<string, 'SourcePath'>;

export interface LocatedSource {
    readonly kind: 'located';
    readonly source: SourcePath;
}

export type Located = LocatedSource | Unknown;

export type RunningCount = Brand<number, 'RunningCount'>;
export type FlightReason = Brand<string, 'FlightReason'>;
export type AwaitedNames = Brand<string, 'AwaitedNames'>;
export type BackgroundTool = Brand<string, 'BackgroundTool'>;
export type BackgroundLabel = Brand<string, 'BackgroundLabel'>;

export interface BackgroundItem {
    readonly tool: BackgroundTool;
    readonly label: BackgroundLabel;
}

export type Foreground =
    | { readonly kind: 'none' }
    | { readonly kind: 'running'; readonly count: RunningCount; readonly why: FlightReason }
    | { readonly kind: 'unknown'; readonly why: FlightReason };

export type Awaiting = { readonly kind: 'none' } | { readonly kind: 'on'; readonly names: AwaitedNames };

export interface Observed {
    readonly foreground: Foreground;
    readonly background: readonly BackgroundItem[];
}

export interface Flight extends Observed {
    readonly awaiting: Awaiting;
}

export type WindowSource = 'agent' | 'catalogue' | 'table' | 'observed' | 'setting';

export interface ContextUse {
    readonly tokens: Count;
    readonly window: Count;
    readonly source: WindowSource;
}

export interface SessionReader {
    readonly harness: HarnessKind;
    locate(session: FollowedSession): Promise<Located>;
    read(source: SourcePath, was: Position, budget: Count): Promise<Chunk | Unknown>;
    carry?(from: Located, to: Located, at: Position): Promise<Position>;
}
export interface SessionSource {
    readerFor(harness: HarnessKind): SessionReader | undefined;
    unavailableReason(harness: HarnessKind): Text;
}
