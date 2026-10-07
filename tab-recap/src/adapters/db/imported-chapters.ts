// The 1.x recaps a database still holds for a tab — read-only, so a replay can set the last good recap of each chapter beside what it makes.
// A 1.x recap is the `item` rows of a run; the run is good when it did not fail, and the recap of a chapter is its newest good run's.
import { existsSync } from 'node:fs';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import { connectReadOnly } from './connection.ts';
import { all, blob, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

const SECTION_ORDER = "CASE i.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END";

const CHAPTERS = `SELECT c.n, r.id AS run, r.at FROM chapter c JOIN run r ON r.id = (
    SELECT r2.id FROM run r2 WHERE r2.chapter_id = c.id AND r2.error IS NULL AND EXISTS (SELECT 1 FROM item i WHERE i.run_id = r2.id AND i.view = 'recap') ORDER BY r2.id DESC LIMIT 1)
  WHERE c.tab_id = ? ORDER BY c.n`;

const ITEMS = `SELECT t.key AS task, i.section, i.position, i.text FROM item i JOIN task t ON t.id = i.task_id JOIN run_task rt ON rt.run_id = i.run_id AND rt.task_id = i.task_id
  WHERE i.run_id = ? AND i.view = 'recap' ORDER BY rt.position, ${SECTION_ORDER}, i.position`;

const itemOf = (row: Row): ImportedChapter['items'][number] => {
    const key = `state/${text(row, 'task')}/${text(row, 'section')}/${whole(row, 'position')}`;
    return { key, section: text(row, 'section'), text: text(row, 'text'), fact: key, born: false, anchor: null };
};

/** The tab's chapters that have a good 1.x recap, oldest first; null when the file, or the tables of a 1.x recap, are not there. */
export function importedChapters(path: string, tab: string): readonly ImportedChapter[] | null {
    if (!existsSync(path)) {
        return null;
    }
    const db = connectReadOnly(path);
    try {
        const items = db.prepare(ITEMS);
        return all(db.prepare(CHAPTERS), tab).map((row) => ({ n: whole(row, 'n'), at: whole(row, 'at'), items: all(items, blob(row, 'run')).map(itemOf) }));
    } catch {
        return null;
    } finally {
        db.close();
    }
}
