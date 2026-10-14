import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { WorktreeStatusReader, WorktreeStatusWriter } from '#src/ports/worktree-status.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { writeTx } from './connection.ts';
import { guarded, isRow, one } from './rows.ts';

type WorktreeStatusRow = WorktreeStatus;

const READ = 'SELECT s.root AS root, s.branch AS branch, s.ahead AS ahead, s.tracked AS tracked, s.untracked AS untracked, s.at AS at FROM pane_worktree p JOIN worktree_status s ON s.root = p.root WHERE p.pane = ?';

const WRITE = 'INSERT INTO worktree_status (root, branch, ahead, tracked, untracked, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(root) DO UPDATE SET branch = excluded.branch, ahead = excluded.ahead, tracked = excluded.tracked, untracked = excluded.untracked, at = excluded.at';

export function parseWorktreeStatusRow(input: unknown): Result<WorktreeStatusRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    const root = parseDirectory(input.root);
    if (root.kind === 'err') {
        return root;
    }
    const branch = parseText(input.branch);
    if (branch.kind === 'err') {
        return branch;
    }
    const ahead = input.ahead === null ? ok(null) : parseCount(input.ahead);
    if (ahead.kind === 'err') {
        return ahead;
    }
    const tracked = parseCount(input.tracked);
    if (tracked.kind === 'err') {
        return tracked;
    }
    const untracked = input.untracked === null ? ok(null) : parseCount(input.untracked);
    if (untracked.kind === 'err') {
        return untracked;
    }
    const at = parseInstant(input.at);
    if (at.kind === 'err') {
        return at;
    }
    return ok({ root: root.value, branch: branch.value, ahead: ahead.value, tracked: tracked.value, untracked: untracked.value, at: at.value });
}

export class WorktreeStatusRepository implements WorktreeStatusWriter, WorktreeStatusReader {
    private readonly db: DatabaseSync;
    private readonly read: StatementSync;
    private readonly upsert: StatementSync;
    private readonly bound: StatementSync;
    private readonly unbound: StatementSync;
    private readonly dropStatus: StatementSync;
    private readonly dropBindings: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.read = db.prepare(READ);
        this.upsert = db.prepare(WRITE);
        this.bound = db.prepare('INSERT INTO pane_worktree (pane, root) VALUES (?, ?) ON CONFLICT(pane) DO UPDATE SET root = excluded.root');
        this.unbound = db.prepare('DELETE FROM pane_worktree WHERE pane = ?');
        this.dropStatus = db.prepare('DELETE FROM worktree_status WHERE root = ?');
        this.dropBindings = db.prepare('DELETE FROM pane_worktree WHERE root = ?');
    }

    write(status: WorktreeStatus): void {
        this.upsert.run(status.root, status.branch, status.ahead, status.tracked, status.untracked, status.at);
    }

    bind(pane: PaneId, root: Directory | null): void {
        if (root === null) {
            this.unbound.run(pane);
        } else {
            this.bound.run(pane, root);
        }
    }

    drop(root: Directory): void {
        writeTx(this.db, () => {
            this.dropBindings.run(root);
            this.dropStatus.run(root);
        });
    }

    reset(): void {
        writeTx(this.db, () => {
            this.db.exec('DELETE FROM pane_worktree');
            this.db.exec('DELETE FROM worktree_status');
        });
    }

    statusOf(pane: PaneId): WorktreeStatus | null {
        return guarded(() => {
            const row = one(this.read, pane);
            if (row === null) {
                return null;
            }
            const parsed = parseWorktreeStatusRow(row);
            return parsed.kind === 'ok' ? parsed.value : null;
        }, null);
    }
}
