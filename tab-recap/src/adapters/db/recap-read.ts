// The current recap of a tab: the tasks of the last run that wrote one, each with its open facts drawn under the caps (queries only).
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { renderRecap } from '#src/recap/application/recap-shape.ts';
import { sectionsOfOpen } from '#src/recap/domain/ledger-view.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { all, blob, flag, maybeText, one, text, whole } from './rows.ts';
import { typeIdOf } from './typeid.ts';
import type { Row } from './rows.ts';
import type { LedgerRows } from './ledger-rows.ts';

const cursorOf = (row: Row): LaneCursor => ({
    pane: text(row, 'pane'), agent: text(row, 'agent'), transcript: text(row, 'source'), cursor: whole(row, 'cursor'),
    tail: maybeText(row, 'tail'), title: maybeText(row, 'title'), lastPrompt: maybeText(row, 'last_prompt'), claudeRecap: maybeText(row, 'claude_note'),
});

/** Rows grouped by their task; the TypeID text is the key, so two byte arrays of one id meet. */
const groupBy = <T>(rows: readonly Row[], make: (row: Row) => T): Map<string, T[]> => {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const task = typeIdOf('task', blob(row, 'task_id'));
        groups.set(task, [...(groups.get(task) ?? []), make(row)]);
    }
    return groups;
};

export class RecapReader {
    private readonly current: StatementSync;
    private readonly good: StatementSync;
    private readonly newest: StatementSync;
    private readonly cost: StatementSync;
    private readonly lanes: StatementSync;
    private readonly tasks: StatementSync;
    private readonly taskLanes: StatementSync;
    private readonly ledger: LedgerRows;

    constructor(db: DatabaseSync, ledger: LedgerRows) {
        this.ledger = ledger;
        // a tab has a recap once anything was written for it: a lane's cursor, a run, a writer in flight, an error line
        this.current = db.prepare(`SELECT t.running, t.backend, t.error FROM tab t WHERE t.id = ? AND (t.running = 1 OR t.error IS NOT NULL OR t.backend IS NOT NULL
          OR EXISTS (SELECT 1 FROM transcript WHERE tab_id = t.id) OR EXISTS (SELECT 1 FROM chapter WHERE tab_id = t.id))`);
        this.good = db.prepare('SELECT r.id, r.at, r.language FROM run r JOIN last_good_run g ON g.run_id = r.id WHERE g.tab_id = ?');
        this.newest = db.prepare('SELECT r.language FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ? ORDER BY r.id DESC LIMIT 1');
        this.cost = db.prepare('SELECT COALESCE(SUM(r.cost_micro_usd), 0) AS micro FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ?');
        this.lanes = db.prepare('SELECT pane, agent, source, cursor, tail, title, last_prompt, claude_note FROM transcript WHERE tab_id = ? AND attached = 1 ORDER BY position, id');
        this.tasks = db.prepare('SELECT r.task_id, k.key, r.name, r.legacy_markdown FROM run_task r JOIN task k ON k.id = r.task_id WHERE r.run_id = ? ORDER BY r.position');
        this.taskLanes = db.prepare('SELECT l.task_id, t.pane FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE l.run_id = ? ORDER BY l.task_id, l.position');
    }

    private tasksOf(tab: string, run: Uint8Array, language: string): readonly RecapTask[] {
        const lanes = groupBy(all(this.taskLanes, run), (row) => text(row, 'pane'));
        return all(this.tasks, run).map((row) => {
            const legacy = maybeText(row, 'legacy_markdown');
            const key = text(row, 'key');
            const sections = legacy === null ? sectionsOfOpen(this.ledger.openOf({ tab, key })) : null;
            return {
                id: key, name: maybeText(row, 'name') ?? '', lanes: lanes.get(typeIdOf('task', blob(row, 'task_id'))) ?? [], sections,
                markdown: sections === null ? (legacy ?? '') : renderRecap(sections, language === 'es' ? 'es' : 'en'),
            };
        });
    }

    /** What the recap says about itself: the last good run's time and language, else the newest run's language. */
    private facts(tab: string): { readonly run: Uint8Array | null; readonly at: number | null; readonly language: string } {
        const good = one(this.good, tab);
        if (good !== null) {
            return { run: blob(good, 'id'), at: whole(good, 'at'), language: text(good, 'language') };
        }
        const newest = one(this.newest, tab);
        return { run: null, at: null, language: newest === null ? 'en' : text(newest, 'language') };
    }

    /** `null` when the tab has never had a recap; a row that is not what the schema promises throws (the repository guards it). */
    read(tab: string): TabRecap | null {
        const row = one(this.current, tab);
        if (row === null) {
            return null;
        }
        const facts = this.facts(tab);
        return {
            tab, lanes: all(this.lanes, tab).map(cursorOf), tasks: facts.run === null ? [] : this.tasksOf(tab, facts.run, facts.language), at: facts.at, running: flag(row, 'running'),
            backend: maybeText(row, 'backend'), error: maybeText(row, 'error'), costUsd: whole(one(this.cost, tab) ?? {}, 'micro') / 1e6, language: facts.language,
        };
    }
}
