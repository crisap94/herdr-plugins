import { existsSync } from 'node:fs';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { parseImportedChapterItem, type ImportedChapterRecord } from '#src/ports/imported-recaps.ts';
import { connectReadOnly } from './connection.ts';
import { all, blob, whole } from './rows.ts';

const SECTION_ORDER = "CASE i.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END";

const FACT_KEY = "'state/' || t.key || '/' || i.section || '/' || i.position";

const CHAPTERS = `SELECT c.n, r.id AS run, r.at FROM chapter c JOIN run r ON r.id = (
    SELECT r2.id FROM run r2 WHERE r2.chapter_id = c.id AND r2.error IS NULL AND EXISTS (SELECT 1 FROM item i WHERE i.run_id = r2.id AND i.view = 'recap') ORDER BY r2.id DESC LIMIT 1)
  WHERE c.tab_id = ? ORDER BY c.n`;

const ITEMS = `SELECT ${FACT_KEY} AS key, i.section AS section, i.text AS text, ${FACT_KEY} AS fact FROM item i JOIN task t ON t.id = i.task_id JOIN run_task rt ON rt.run_id = i.run_id AND rt.task_id = i.task_id
  WHERE i.run_id = ? AND i.view = 'recap' ORDER BY rt.position, ${SECTION_ORDER}, i.position`;

export function importedChaptersAt(path: FsPath, tab: TabId): readonly ImportedChapterRecord[] | null {
    if (!existsSync(path)) {
        return null;
    }
    const db = connectReadOnly(path);
    try {
        const items = db.prepare(ITEMS);
        return all(db.prepare(CHAPTERS), tab).map((row) => ({ n: must(parseCount(whole(row, 'n'))), at: instant(whole(row, 'at')), items: all(items, blob(row, 'run')).flatMap((item) => {
            const parsed = parseImportedChapterItem({ ...item, born: false, anchor: null });
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }) }));
    } catch {
        return null;
    } finally {
        db.close();
    }
}
