import {
    unknown as unknownOf,
    type Advance,
    type Fact,
    type FactStore,
    type FailedRun,
    type FailureCause,
    type Instant,
    type LastRun,
    type Recap,
    type RecapTask,
    type RecordedRun,
    type Records,
    type ScopeId,
    type SessionKey,
    type SessionMark,
    type TaskId,
    type Text,
    type Unknown,
} from '@stateforge-labs/session-ledger';
import { handleOf, type Handle } from '@stateforge-labs/session-ledger-sqlite/driver';
import type { Store } from '@stateforge-labs/session-ledger-sqlite';
import {
    backendAt,
    causeAt,
    costAt,
    errorAt,
    factOf,
    historyFactOf,
    instantAt,
    languageAt,
    lanesOf,
    recapAtOf,
    runningAt,
    tabIdOfScope,
    tasksOf,
    type Row,
} from './decode.ts';

const HISTORY_LIMIT = 300;

const isFailureCause = (raw: string): raw is FailureCause => raw.length >= 0;

const failureCauseOf = (failure: unknown): FailureCause => {
    const detail = failure instanceof Error ? failure.message : 'the ledger file could not be read';
    if (isFailureCause(detail)) {
        return detail;
    }
    throw new Error('a failure cause is a string');
};

const unreadable = (failure: unknown): Unknown => {
    const detail = failureCauseOf(failure);
    return unknownOf({ why: 'unreadable', detail });
};

const guarded = <T>(read: () => T): T | Unknown => {
    try {
        return read();
    } catch (failure) {
        return unreadable(failure);
    }
};

const rowsOf = (db: Handle, sql: string, ...params: readonly (string | number | null)[]): readonly Row[] => db.prepare(sql).all(...params);

const writeFact = (db: Handle, fact: Fact): void => {
    db.prepare(
        `INSERT INTO fact (id, tab, task_key, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, language)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET tab = excluded.tab, task_key = excluded.task_key, section = excluded.section, text = excluded.text,
            why = excluded.why, ref = excluded.ref, agent = excluded.agent, anchor = excluded.anchor, first_at = excluded.first_at,
            last_at = excluded.last_at, state = excluded.state, closed_why = excluded.closed_why, closed_at = excluded.closed_at,
            language = excluded.language`,
    ).run(
        fact.id,
        fact.task.tab,
        fact.task.key,
        fact.section,
        fact.text,
        fact.why,
        fact.ref,
        fact.agent,
        fact.anchor,
        fact.firstAt,
        fact.lastAt,
        fact.state,
        fact.closedWhy,
        fact.closedAt,
        fact.language,
    );
};

const ensureRecap = (db: Handle, scope: string, at: Instant | null): void => {
    db.prepare("INSERT OR IGNORE INTO recap (scope, lanes, tasks, at, running, cost_usd, language) VALUES (?, '[]', '[]', ?, 0, 0, '')").run(scope, at);
};

const keepMarks = (db: Handle, scope: string, marks: Advance['marks']): void => {
    for (const mark of marks ?? []) {
        db.prepare('INSERT INTO mark (scope, at, body) VALUES (?, ?, ?)').run(scope, mark.at, JSON.stringify(mark));
    }
};

const openFactsOf = (db: Handle, task: TaskId): readonly Fact[] =>
    rowsOf(db, "SELECT * FROM fact WHERE tab = ? AND task_key = ? AND state = 'open' ORDER BY first_at, rowid", task.tab, task.key).map(factOf);

const markdownOf = (db: Handle, tab: string, id: Text): Text => {
    const joined = openFactsOf(db, { tab: tabIdOfScope(tab), key: id })
        .map((fact) => fact.text)
        .join('\n');
    return isText(joined) ? joined : id;
};

const isText = (raw: string): raw is Text => raw.length >= 0;

const tasksWithMarkdown = (db: Handle, run: RecordedRun): readonly RecapTask[] =>
    run.tasks.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes, sections: null, markdown: markdownOf(db, run.tab, task.id) }));

const recapOf = (row: Row, tab: string): Recap => ({
    tab: tabIdOfScope(tab),
    lanes: lanesOf(String(row.lanes)),
    tasks: tasksOf(String(row.tasks)),
    at: recapAtOf(row),
    running: runningAt(row),
    backend: backendAt(row),
    error: errorAt(row),
    costUsd: costAt(row),
    language: languageAt(row),
});

const recordsOf = (db: Handle, writing: Store): Records => ({
    readRecap: (scope: ScopeId) =>
        guarded((): Recap | null => {
            const row = rowsOf(db, 'SELECT * FROM recap WHERE scope = ?', scope)[0];
            return row === undefined ? null : recapOf(row, scope);
        }),
    lastRunOf: (scope: ScopeId) =>
        guarded((): LastRun | null => {
            const row = rowsOf(db, 'SELECT at, cause FROM last_run WHERE scope = ?', scope)[0];
            return row === undefined ? null : { at: instantAt(row, 'at'), cause: causeAt(row, 'cause') };
        }),
    beginRun: (scope: ScopeId, backend: Text | null, at: Instant): void => {
        writing.writeTransaction(() => {
            ensureRecap(db, scope, at);
            db.prepare('UPDATE recap SET running = 1, backend = ? WHERE scope = ?').run(backend, scope);
        });
    },
    recordRun: (run: RecordedRun): void => {
        writing.writeTransaction(() => {
            ensureRecap(db, run.tab, run.at);
            for (const fact of run.changed) {
                writeFact(db, fact);
            }
            db.prepare(
                'UPDATE recap SET lanes = ?, tasks = ?, at = ?, running = 0, backend = ?, error = ?, cost_usd = ?, language = ? WHERE scope = ?',
            ).run(
                JSON.stringify(run.lanes),
                JSON.stringify(tasksWithMarkdown(db, run)),
                run.at,
                run.backend,
                run.error,
                run.costUsd,
                run.language,
                run.tab,
            );
            db.prepare('INSERT INTO last_run (scope, at, cause) VALUES (?, ?, ?) ON CONFLICT (scope) DO UPDATE SET at = excluded.at, cause = excluded.cause').run(
                run.tab,
                run.at,
                run.cause,
            );
            keepMarks(db, run.tab, run.marks);
        });
    },
    failRun: (run: FailedRun): void => {
        writing.writeTransaction(() => {
            ensureRecap(db, run.tab, run.at);
            db.prepare('UPDATE recap SET lanes = ?, running = 0, backend = ?, error = ? WHERE scope = ?').run(JSON.stringify(run.lanes), run.backend, run.error, run.tab);
            keepMarks(db, run.tab, run.marks);
        });
    },
    advance: (move: Advance): void => {
        writing.writeTransaction(() => {
            ensureRecap(db, move.tab, move.at);
            db.prepare('UPDATE recap SET lanes = ?, error = ? WHERE scope = ?').run(JSON.stringify(move.lanes), move.error, move.tab);
            keepMarks(db, move.tab, move.marks);
        });
    },
});

const factsOf = (db: Handle): FactStore => ({
    openOf: (task: TaskId) =>
        guarded(() => rowsOf(db, "SELECT * FROM fact WHERE tab = ? AND task_key = ? AND state = 'open' ORDER BY last_at DESC, rowid", task.tab, task.key).map(factOf)),
    recentlyClosed: (task: TaskId, sinceMs: Instant) =>
        guarded(() =>
            rowsOf(
                db,
                "SELECT * FROM fact WHERE tab = ? AND task_key = ? AND state = 'closed' AND closed_at >= ? ORDER BY closed_at, rowid",
                task.tab,
                task.key,
                sinceMs,
            ).map(factOf),
        ),
    allOf: (task: TaskId) => guarded(() => rowsOf(db, 'SELECT * FROM fact WHERE tab = ? AND task_key = ? ORDER BY first_at, rowid', task.tab, task.key).map(factOf)),
    keysOf: (scope: ScopeId) =>
        guarded(() =>
            rowsOf(db, 'SELECT DISTINCT task_key FROM fact WHERE tab = ? ORDER BY task_key', scope).map((row) => String(row.task_key)),
        ),
    historyOf: (scope: ScopeId, key: SessionKey) =>
        rowsOf(db, 'SELECT * FROM fact WHERE tab = ? AND task_key = ? ORDER BY last_at DESC, rowid LIMIT ?', scope, key, HISTORY_LIMIT).map(historyFactOf),
});

export interface LedgerRows {
    readonly records: Records;
    readonly facts: FactStore;
    marksOf(scope: ScopeId): readonly Pick<SessionMark, 'at'>[];
}

export function ledgerRowsOf(store: Store): LedgerRows {
    const db = handleOf(store);
    return {
        records: recordsOf(db, store),
        facts: factsOf(db),
        marksOf: (scope: ScopeId) => rowsOf(db, 'SELECT at FROM mark WHERE scope = ? ORDER BY id', scope).map((row) => ({ at: instantAt(row, 'at') })),
    };
}
