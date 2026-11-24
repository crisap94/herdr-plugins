import { brand, type Brand } from './brand.ts';
import type { Directory } from './directory.ts';
import type { Text } from './text.ts';
import type { Instant } from './time.ts';

export type SessionKey = Brand<string, 'SessionKey'>;
export const paneIdOf = brand<string, 'SessionKey'>;
export type ScopeId = Brand<string, 'ScopeId'>;
export const tabIdOf = brand<string, 'ScopeId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type HarnessKind = Brand<string, 'HarnessKind'>;
export const agentKindOf = brand<string, 'HarnessKind'>;
export type LaneStatus = 'working' | 'blocked' | 'idle' | 'done' | 'unknown';
export interface Lane { readonly pane: SessionKey; readonly tab: ScopeId; readonly workspace: WorkspaceId; readonly agent: HarnessKind; readonly status: LaneStatus; readonly session: SessionId | null; readonly cwd: Directory | null; readonly title: Text | null; readonly since: Instant | null; }
