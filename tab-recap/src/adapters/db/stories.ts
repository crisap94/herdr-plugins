import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Applied, Ledger } from '#src/ports/ledger.ts';
import type { CurationRun, Stories, Story } from '#src/ports/stories.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import { writeTx } from './connection.ts';
import { guarded, maybeText, maybeWhole, one, blob } from './rows.ts';
import { typeIdOf } from './typeid.ts';

export class StoriesRepository implements Stories {
    private readonly db: DatabaseSync;
    private readonly ledger: Ledger;
    private readonly select: StatementSync;
    private readonly update: StatementSync;
    private readonly newestRun: StatementSync;

    constructor(db: DatabaseSync, ledger: Ledger) {
        this.db = db;
        this.ledger = ledger;
        this.select = db.prepare('SELECT story_text, story_at FROM task WHERE tab_id = ? AND key = ?');
        this.update = db.prepare('UPDATE task SET story_text = ?, story_at = ? WHERE tab_id = ? AND key = ?');
        this.newestRun = db.prepare('SELECT run.id AS id FROM run JOIN chapter ON chapter.id = run.chapter_id WHERE chapter.tab_id = ? ORDER BY run.id DESC LIMIT 1');
    }

    read(tab: string, task: string): Story | null {
        return guarded(() => {
            const row = one(this.select, tab, task);
            const text = row === null ? null : maybeText(row, 'story_text');
            const at = row === null ? null : maybeWhole(row, 'story_at');
            return text === null || at === null ? null : { text, at };
        }, null);
    }

    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied {
        return writeTx(this.db, () => {
            const latest = one(this.newestRun, run.task.tab);
            if (latest === null) {
                throw new Error(`${run.task.tab} has no run: a curator has nothing to attribute its merges to`);
            }
            const ref = { id: typeIdOf('run', blob(latest, 'id')) as RunId, task: run.task, at: run.at, language: run.language, mint: (): FactId => { throw new Error('the curator adds no fact'); } };
            const applied = this.ledger.apply(ref, [...change.merges, ...(change.reconciled ?? [])]);
            if (change.story !== null) {
                this.update.run(change.story, run.at, run.task.tab, run.task.key);
            }
            return applied;
        });
    }
}
