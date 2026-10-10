// The daemon's events about itself, on every workspace (`workspace.report_metadata`), and the list of the workspaces herdr has.
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

export type WorkspacesResult = { readonly kind: 'workspaces'; readonly ids: readonly string[] } | Unknown;

export interface WorkspaceTokens {
    reportWorkspace(workspace: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
    workspaces(): Promise<WorkspacesResult>;
}
