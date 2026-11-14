import type { Brand, Unknown } from './kernel.ts';
import type { Directory, HarnessKind, SessionId, SessionKey } from './ids.ts';

export interface FollowedSession {
    readonly key: SessionKey;
    readonly harness: HarnessKind;
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
    readonly title: string | null;
}
export type RecapCause = 'turn-ended' | 'focused' | 'requested';

export type CallKind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';

export interface Entry {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
    readonly at?: number;
    readonly queued?: boolean;
    readonly kind?: CallKind;
    readonly what?: string;
}

export interface AgentNote {
    readonly kind: 'away_summary' | 'compaction';
    readonly at: number | null;
    readonly text: string;
}

export interface Position {
    readonly cursor: number;
    readonly tail: string | null;
}

export const UNREAD: Position = { cursor: 0, tail: null };

export interface Mark {
    readonly kind: 'compacted' | 'compaction-failed';
    readonly at: number | null;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
    readonly trigger?: 'auto' | 'manual';
}

export interface Chunk {
    readonly kind: 'chunk';
    readonly entries: readonly Entry[];
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
    readonly notes: readonly AgentNote[];
    readonly marks?: readonly Mark[];
    readonly position: Position;
    readonly grew: boolean;
}

export type Located = { readonly kind: 'located'; readonly source: string } | Unknown;

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
    readonly tokens: number;
    readonly window: number;
    readonly source: WindowSource;
}

export interface SessionReader {
    readonly harness: HarnessKind;
    locate(session: FollowedSession): Promise<Located>;
    read(source: string, was: Position, budget: number): Promise<Chunk | Unknown>;
}
export interface SessionSource {
    readerFor(harness: HarnessKind): SessionReader | undefined;
    unavailableReason(harness: HarnessKind): string;
}
