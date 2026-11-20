import type { Database } from 'bun:sqlite';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { all, blob, text, whole } from '../rows.ts';
import { ids } from '../uuid7.ts';
import { itemsToFacts } from './items-to-facts.ts';
import type { ImportedFact, ImportedItem, ImportedRun } from './items-to-facts.ts';

interface TaskOwner {
    readonly tab: Text;
    readonly task: Uint8Array;
}

interface TaskRuns extends TaskOwner {
    readonly runs: ImportedRun[];
}

function runsOfTasks(db: Database): readonly TaskRuns[] {
    const carried = all(db.prepare('SELECT rt.task_id, k.tab_id, r.id AS run_id, r.at, r.language, r.error IS NULL AS good FROM run_task rt JOIN run r ON r.id = rt.run_id JOIN task k ON k.id = rt.task_id ORDER BY rt.task_id, r.id'));
    const items = new Map<string, ImportedItem[]>();
    for (const row of all(db.prepare("SELECT run_id, task_id, section, position, text FROM item WHERE view = 'recap'"))) {
        const section = text(row, 'section');
        const key = `${Buffer.from(blob(row, 'run_id')).toString('hex')}/${Buffer.from(blob(row, 'task_id')).toString('hex')}`;
        items.set(key, [...(items.get(key) ?? []), ...(isSection(section) ? [{ section, position: must(parseCount(whole(row, 'position'))), text: must(parseText(text(row, 'text'))) }] : [])]);
    }
    const tasks = new Map<string, { tab: Text; task: Uint8Array; runs: ImportedRun[] }>();
    for (const row of carried) {
        const task = blob(row, 'task_id');
        const taskKey = Buffer.from(task).toString('hex');
        const group = tasks.get(taskKey) ?? { tab: must(parseText(text(row, 'tab_id'))), task, runs: [] };
        const run = blob(row, 'run_id');
        group.runs.push({ run, at: instant(whole(row, 'at')), language: must(parseText(text(row, 'language'))), good: whole(row, 'good') === 1 ? 'good' : 'failed', items: items.get(`${Buffer.from(run).toString('hex')}/${taskKey}`) ?? [] });
        tasks.set(taskKey, group);
    }
    return [...tasks.values()];
}

function write(db: Database, owner: TaskOwner, facts: readonly ImportedFact[]): void {
    const insert = db.prepare(`INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const fact of facts) {
        insert.run(ids.next(), owner.tab, owner.task, fact.section, fact.text, fact.why, fact.firstAt, fact.lastAt, fact.closed === null ? 'open' : 'closed', fact.closed?.why ?? null, fact.closed?.at ?? null, fact.bornRun, fact.lastRun, fact.language);
    }
}

export function importFacts(handle: Database): void {
    for (const owner of runsOfTasks(handle)) {
        write(handle, owner, itemsToFacts(owner.runs));
    }
}
