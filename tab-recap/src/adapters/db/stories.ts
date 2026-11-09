import type { Database } from 'bun:sqlite';
import { and, desc, eq } from 'drizzle-orm';
import type { Applied, Ledger } from '#src/ports/ledger.ts';
import type { CurationRun, Stories, Story } from '#src/ports/stories.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { writeTx } from './connection.ts';
import { chapter, run as runs, task as tasks } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';
import { typeIdOf } from './typeid.ts';

export class StoriesRepository implements Stories {
    private readonly db: Database;
    private readonly ledger: Ledger;
    private readonly orm: Orm;

    constructor(db: Database, ledger: Ledger) {
        this.db = db;
        this.ledger = ledger;
        this.orm = ormOf(db);
    }

    read(tab: string, task: string): Story | null {
        return guarded(() => {
            const row = this.orm.select({ text: tasks.storyText, at: tasks.storyAt }).from(tasks)
                .where(and(eq(tasks.tabId, tabId(tab)), eq(tasks.key, task))).get();
            const text = row?.text ?? null;
            const at = row?.at ?? null;
            return text === null || at === null ? null : { text, at };
        }, null);
    }

    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied {
        return writeTx(this.db, () => {
            const latest = this.orm.select({ id: runs.id }).from(runs)
                .innerJoin(chapter, eq(chapter.id, runs.chapterId))
                .where(eq(chapter.tabId, tabId(run.task.tab)))
                .orderBy(desc(runs.id)).limit(1).get();
            if (latest === undefined) {
                throw new Error(`${run.task.tab} has no run: a curator has nothing to attribute its merges to`);
            }
            const ref = { id: typeIdOf('run', latest.id) as RunId, task: run.task, at: run.at, language: run.language, mint: (): FactId => { throw new Error('the curator adds no fact'); } };
            const applied = this.ledger.apply(ref, [...change.merges, ...(change.reconciled ?? [])]);
            if (change.story !== null) {
                this.orm.update(tasks).set({ storyText: change.story, storyAt: run.at })
                    .where(and(eq(tasks.tabId, tabId(run.task.tab)), eq(tasks.key, run.task.key))).run();
            }
            return applied;
        });
    }
}
