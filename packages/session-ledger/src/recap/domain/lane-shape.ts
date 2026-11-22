import { brand, type Brand } from './brand.ts';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AgentKind = Brand<string, 'AgentKind'>;
export const agentKindOf = brand<string, 'AgentKind'>;
export type LaneStatus = 'working' | 'blocked' | 'idle' | 'done' | 'unknown';
export type { Lane } from './legacy.ts';
