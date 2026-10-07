// Migration 6's step: read the 1.x items back as runs per task, make facts of them (items-to-facts.ts) and write the `fact` rows.
import type { DatabaseSync } from 'node:sqlite';
import { isSection } from '#src/recap/domain/fact.ts';
import { all, blob, text, whole } from '../rows.ts';
import { ids } from '../uuid7.ts';
import { itemsToFacts } from './items-to-facts.ts';
import type { ImportedFact, ImportedItem, ImportedRun } from './items-to-facts.ts';

const hex = (id: Uint8Array): string => Buffer.from(id).toString('hex');
const bytes = (id: string): Uint8Array => Uint8Array.from(Buffer.from(id, 'hex'));

/** Every run that carried a task, oldest first, with the task's items in it. */
function runsOfTasks(db: DatabaseSync): ReadonlyMap<string, { readonly tab: string; readonly task: Uint8Array; readonly runs: ImportedRun[] }> {
    const carried = all(db.prepare('SELECT rt.task_id, k.tab_id, r.id AS run_id, r.at, r.language, r.error IS NULL AS good FROM run_task rt JOIN run r ON r.id = rt.run_id JOIN task k ON k.id = rt.task_id ORDER BY rt.task_id, r.id'));
    const items = new Map<string, ImportedItem[]>();
    for (const row of all(db.prepare("SELECT run_id, task_id, section, position, text FROM item WHERE view = 'recap'"))) {
        const section = text(row, 'section');
        const key = `${hex(blob(row, 'run_id'))}/${hex(blob(row, 'task_id'))}`;
        items.set(key, [...(items.get(key) ?? []), ...(isSection(section) ? [{ section, position: whole(row, 'position'), text: text(row, 'text') }] : [])]);
    }
    const tasks = new Map<string, { tab: string; task: Uint8Array; runs: ImportedRun[] }>();
    for (const row of carried) {
        const task = blob(row, 'task_id');
        const group = tasks.get(hex(task)) ?? { tab: text(row, 'tab_id'), task, runs: [] };
        group.runs.push({ run: hex(blob(row, 'run_id')), at: whole(row, 'at'), language: text(row, 'language'), good: whole(row, 'good') === 1, items: items.get(`${hex(blob(row, 'run_id'))}/${hex(task)}`) ?? [] });
        tasks.set(hex(task), group);
    }
    return tasks;
}

function write(db: DatabaseSync, owner: { readonly tab: string; readonly task: Uint8Array }, facts: readonly ImportedFact[]): void {
    const insert = db.prepare(`INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const fact of facts) {
        insert.run(ids.next(), owner.tab, owner.task, fact.section, fact.text, fact.why, fact.firstAt, fact.lastAt, fact.closed === null ? 'open' : 'closed', fact.closed?.why ?? null, fact.closed?.at ?? null, bytes(fact.bornRun), bytes(fact.lastRun), fact.language);
    }
}

/** Import every stored item. The `item` rows are left as they are. */
export function importFacts(db: DatabaseSync): void {
    for (const owner of runsOfTasks(db).values()) {
        write(db, owner, itemsToFacts(owner.runs));
    }
}

