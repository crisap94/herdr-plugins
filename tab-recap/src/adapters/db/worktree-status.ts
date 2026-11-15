import type { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
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
import { paneWorktree, worktreeStatus } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded, isRow } from './rows.ts';

type WorktreeStatusRow = WorktreeStatus;

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
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    write(status: WorktreeStatus): void {
        this.orm.insert(worktreeStatus).values({ root: status.root, branch: status.branch, ahead: status.ahead, tracked: status.tracked, untracked: status.untracked, at: status.at })
            .onConflictDoUpdate({
                target: worktreeStatus.root,
                set: {
                    branch: sql`excluded.branch`,
                    ahead: sql`excluded.ahead`,
                    tracked: sql`excluded.tracked`,
                    untracked: sql`excluded.untracked`,
                    at: sql`excluded.at`,
                },
            })
            .run();
    }

    bind(pane: PaneId, root: Directory | null): void {
        if (root === null) {
            this.orm.delete(paneWorktree).where(eq(paneWorktree.pane, pane)).run();
        } else {
            this.orm.insert(paneWorktree).values({ pane, root }).onConflictDoUpdate({ target: paneWorktree.pane, set: { root: sql`excluded.root` } }).run();
        }
    }

    drop(root: Directory): void {
        writeTx(this.db, () => {
            this.orm.delete(paneWorktree).where(eq(paneWorktree.root, root)).run();
            this.orm.delete(worktreeStatus).where(eq(worktreeStatus.root, root)).run();
        });
    }

    reset(): void {
        writeTx(this.db, () => {
            this.orm.delete(paneWorktree).run();
            this.orm.delete(worktreeStatus).run();
        });
    }

    statusOf(pane: PaneId): WorktreeStatus | null {
        return guarded(() => {
            const row = this.orm.select({
                root: worktreeStatus.root,
                branch: worktreeStatus.branch,
                ahead: worktreeStatus.ahead,
                tracked: worktreeStatus.tracked,
                untracked: worktreeStatus.untracked,
                at: worktreeStatus.at,
            })
                .from(paneWorktree)
                .innerJoin(worktreeStatus, eq(worktreeStatus.root, paneWorktree.root))
                .where(eq(paneWorktree.pane, pane))
                .get() ?? null;
            if (row === null) {
                return null;
            }
            const parsed = parseWorktreeStatusRow(row);
            return parsed.kind === 'ok' ? parsed.value : null;
        }, null);
    }
}
