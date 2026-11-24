import type { Directory } from '@stateforge-labs/session-ledger';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { PorcelainReading } from '#src/recap/domain/porcelain.ts';
import type { StatusTier, WorktreeStatus, WorktreeWatch } from '#src/recap/domain/worktree.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';

export type WorktreeLookup = { readonly kind: 'worktree'; readonly worktree: WorktreeWatch } | { readonly kind: 'no-repo' } | Unknown;

export interface WorktreeLocator {
    locate(cwd: Directory): Promise<WorktreeLookup>;
}

export type StatusRead = { readonly kind: 'read'; readonly reading: PorcelainReading } | Unknown;

export interface WorktreeProbe {
    read(root: Directory, tier: StatusTier): Promise<StatusRead>;
}

export interface GitDirWatch {
    close(): void;
}

export interface GitDirWatcher {
    watch(worktree: WorktreeWatch, changed: () => void): GitDirWatch;
}

export interface WorktreeStatusWriter {
    write(status: WorktreeStatus): void;
    bind(pane: SessionKey, root: Directory | null): void;
    drop(root: Directory): void;
    reset(): void;
}

export interface WorktreeStatusReader {
    statusOf(pane: SessionKey): WorktreeStatus | null;
}

export interface PaneNoteWriter {
    replace(pane: SessionKey, notes: readonly NoteToken[]): void;
    forget(pane: SessionKey): void;
    reset(): void;
}

export interface PaneNoteReader {
    notesOf(pane: SessionKey): readonly NoteToken[];
}
