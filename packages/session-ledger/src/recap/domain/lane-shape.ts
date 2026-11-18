import type { Brand } from './brand.ts';
import type { Directory } from './directory.ts';
import type { Instant } from './time.ts';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AgentKind = Brand<string, 'AgentKind'>;
export type LaneStatus = 'working' | 'blocked' | 'idle' | 'done' | 'unknown';
export interface Lane {
    readonly pane: PaneId;
    readonly tab: TabId;
    readonly workspace: WorkspaceId;
    readonly agent: AgentKind;
    readonly status: LaneStatus;
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
    readonly title: string | null;
    readonly since: Instant | null;
}
