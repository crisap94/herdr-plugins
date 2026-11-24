import { must } from '#src/protocol/result.ts';
import type { Database } from 'bun:sqlite';
import { and, desc, eq } from 'drizzle-orm';
import type { Applied } from '#src/ports/ledger.ts';
import type { CurationRun, Stories, Story } from '#src/ports/stories.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { writeTx } from './connection.ts';
import { chapter, run as runs, task as tasks } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';
import { LedgerRepository } from './ledger.ts';
import { typeIdOf } from './typeid.ts';
import { instant } from '#src/recap/domain/time.ts';

type CuratedRunId = RunId;

const isCuratedRunId = (input: unknown): input is CuratedRunId => typeof input === 'string' && input.startsWith('run_');

export type CurationChange = { readonly story: Text | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] };

export class StoriesRepository implements Stories {
    private readonly db: Database;
    private readonly ledger: LedgerRepository;
    private readonly orm: Orm;

    constructor(db: Database, ledger: LedgerRepository) {
        this.db = db;
        this.ledger = ledger;
        this.orm = ormOf(db);
    }

    read(tab: string, task: string): Story | null {
        return guarded((): Story | null => {
            const row = this.orm.select({ text: tasks.storyText, at: tasks.storyAt }).from(tasks)
                .where(and(eq(tasks.tabId, must(parseTabId(tab))), eq(tasks.key, task))).get();
            const text = row?.text ?? null;
            const at = row?.at ?? null;
            return text === null || at === null ? null : { text: textOf(text), at: instant(at) };
        }, null);
    }

    keep(run: CurationRun, change: CurationChange): Applied {
        return writeTx(this.db, () => {
            const latest = this.orm.select({ id: runs.id }).from(runs)
                .innerJoin(chapter, eq(chapter.id, runs.chapterId))
                .where(eq(chapter.tabId, run.task.scope))
                .orderBy(desc(runs.id)).limit(1).get();
            if (latest === undefined) {
                throw new Error(`${run.task.scope} has no run: a curator has nothing to attribute its merges to`);
            }
            const id = typeIdOf('run', latest.id);
            if (!isCuratedRunId(id)) {
                throw new Error(`${id} is not a run id`);
            }
            const ref = { id, task: run.task, at: run.at, language: run.language, mint: (): FactId => { throw new Error('the curator adds no fact'); } };
            const applied = this.ledger.apply(ref, [...change.merges, ...(change.reconciled ?? [])]);
            if (change.story !== null) {
                this.orm.update(tasks).set({ storyText: change.story, storyAt: run.at })
                    .where(and(eq(tasks.tabId, run.task.scope), eq(tasks.key, run.task.key))).run();
            }
            return applied;
        });
    }
}
