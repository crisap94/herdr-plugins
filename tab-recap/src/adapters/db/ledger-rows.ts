// The `fact` rows: reading a task's facts, and writing what an answer changed. Row ⇄ Fact is here and nowhere else.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Applied } from '#src/ports/ledger.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import type { ClosedWhy, Fact, FactId, TaskId } from '#src/recap/domain/fact.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { all, BadRow, blob, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { typeIdOf, idOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const SELECT = 'SELECT f.id, f.section, f.text, f.why, f.ref, f.agent, f.first_at, f.last_at, f.state, f.closed_why, f.closed_at, f.language FROM fact f JOIN task k ON k.id = f.task_id WHERE k.tab_id = ?1 AND k.key = ?2';
/** A fact closed longer ago than this is not loaded to be folded: an operation on it reads as an unknown id. */
const FOLD_WINDOW_MS = 24 * 3_600_000;

function closedOf(value: string | null): ClosedWhy | null {
    if (value !== null && !isClosedWhy(value)) {
        throw new BadRow('a fact closed for a reason the schema does not know');
    }
    return value;
}

export class LedgerRows {
    private readonly open: StatementSync;
    private readonly closed: StatementSync;
    private readonly every: StatementSync;
    private readonly foldable: StatementSync;
    private readonly keys: StatementSync;
    private readonly taskInsert: StatementSync;
    private readonly taskSelect: StatementSync;
    private readonly insert: StatementSync;
    private readonly update: StatementSync;

    constructor(db: DatabaseSync) {
        this.open = db.prepare(`${SELECT} AND f.state = 'open' ORDER BY f.last_at DESC, f.id`);
        this.closed = db.prepare(`${SELECT} AND f.state = 'closed' AND f.closed_at >= ?3 ORDER BY f.closed_at, f.id`);
        this.every = db.prepare(`${SELECT} ORDER BY f.first_at, f.id`);
        this.foldable = db.prepare(`${SELECT} AND (f.state = 'open' OR f.closed_at >= ?3) ORDER BY f.first_at, f.id`);
        this.keys = db.prepare('SELECT DISTINCT k.key FROM fact f JOIN task k ON k.id = f.task_id WHERE k.tab_id = ? ORDER BY k.key');
        this.taskInsert = db.prepare('INSERT OR IGNORE INTO task (id, tab_id, key) VALUES (?, ?, ?)');
        this.taskSelect = db.prepare('SELECT id FROM task WHERE tab_id = ? AND key = ?');
        this.insert = db.prepare(`INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.update = db.prepare('UPDATE fact SET text = ?, why = ?, ref = ?, agent = ?, last_at = ?, state = ?, closed_why = ?, closed_at = ?, last_run = ?, language = ? WHERE id = ?');
    }

    private factOf(row: Row, task: TaskId): Fact {
        const [section, closedWhy, state] = [text(row, 'section'), maybeText(row, 'closed_why'), text(row, 'state')];
        if (!isSection(section) || (state !== 'open' && state !== 'closed')) {
            throw new BadRow('a fact is not what the schema promises');
        }
        return {
            id: typeIdOf('fact', blob(row, 'id')) as FactId, task, section, text: text(row, 'text'), why: maybeText(row, 'why'), ref: maybeText(row, 'ref'), agent: maybeText(row, 'agent'),
            firstAt: whole(row, 'first_at'), lastAt: whole(row, 'last_at'), state, closedWhy: closedOf(closedWhy), closedAt: maybeWhole(row, 'closed_at'), language: text(row, 'language'),
        };
    }

    openOf(task: TaskId): readonly Fact[] {
        return all(this.open, task.tab, task.key).map((row) => this.factOf(row, task));
    }

    recentlyClosed(task: TaskId, since: number): readonly Fact[] {
        return all(this.closed, task.tab, task.key, since).map((row) => this.factOf(row, task));
    }

    allOf(task: TaskId): readonly Fact[] {
        return all(this.every, task.tab, task.key).map((row) => this.factOf(row, task));
    }

    keysOf(tab: string): readonly string[] {
        return all(this.keys, tab).map((row) => text(row, 'key'));
    }

    private taskRow(task: TaskId): Uint8Array {
        this.taskInsert.run(ids.next(), task.tab, task.key);
        return blob(one(this.taskSelect, task.tab, task.key) ?? {}, 'id');
    }

    private persist(run: Uint8Array, task: TaskId, before: readonly Fact[], changed: readonly Fact[]): void {
        const owner = this.taskRow(task);
        for (const fact of changed) {
            const id = idOf('fact', fact.id) ?? ids.next();
            if (before.some((was) => was.id === fact.id)) {
                this.update.run(fact.text, fact.why, fact.ref, fact.agent, fact.lastAt, fact.state, fact.closedWhy, fact.closedAt, run, fact.language, id);
            } else {
                this.insert.run(id, task.tab, owner, fact.section, fact.text, fact.why, fact.ref, fact.agent, fact.firstAt, fact.lastAt, fact.state, fact.closedWhy, fact.closedAt, run, run, fact.language);
            }
        }
    }

    /** Fold `ops` into the task's facts and write what changed; the run row must exist. `sweepNow`: the writer's run, which also closes the `now` facts it did not carry forward. A throw (a CHECK, say) is the caller's rollback. */
    applyTo(run: Uint8Array, at: RunRef, ops: readonly Operation[], sweepNow = false): Applied {
        const before = all(this.foldable, at.task.tab, at.task.key, at.at - FOLD_WINDOW_MS).map((row) => this.factOf(row, at.task));
        const folded = apply(before, ops, at, sweepNow);
        this.persist(run, at.task, before, folded.changed);
        return { changed: folded.changed, refused: folded.refused };
    }
}
