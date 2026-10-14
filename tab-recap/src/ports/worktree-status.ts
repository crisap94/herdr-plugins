import type { Directory } from '#src/recap/domain/directory.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { PorcelainReading } from '#src/recap/domain/porcelain.ts';
import type { StatusTier, WorktreeStatus, WorktreeWatch } from '#src/recap/domain/worktree.ts';
import type { Unknown } from './unknowable.ts';

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
    bind(pane: PaneId, root: Directory | null): void;
    drop(root: Directory): void;
    reset(): void;
}

export interface WorktreeStatusReader {
    statusOf(pane: PaneId): WorktreeStatus | null;
}

export interface PaneNoteWriter {
    replace(pane: PaneId, notes: readonly NoteToken[]): void;
    forget(pane: PaneId): void;
    reset(): void;
}

export interface PaneNoteReader {
    notesOf(pane: PaneId): readonly NoteToken[];
}
