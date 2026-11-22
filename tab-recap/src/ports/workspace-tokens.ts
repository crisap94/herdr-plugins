import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import type { WorkspaceId } from '#src/recap/domain/ids.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { Done } from './columns.ts';

export type WorkspaceTokenMap = ReadonlyMap<TokenName, TokenValue | null>;

export type WorkspaceList = { readonly kind: 'workspaces'; readonly ids: readonly WorkspaceId[] } | Unknown;

export interface WorkspaceTokenReporter {
    reportWorkspace(workspace: WorkspaceId, tokens: WorkspaceTokenMap, ttlMs: Milliseconds): Promise<Done>;
    workspaces(): Promise<WorkspaceList>;
}
