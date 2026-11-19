import type { Store } from '#src/adapters/db/database.ts';
import { stateStore } from '#src/adapters/db/database.ts';
import { importFiles } from '#src/adapters/db/import/import-files.ts';
import { LegacyFiles } from '#src/adapters/db/import/legacy-files.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { must } from '#src/protocol/result.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { loadConfig, messagesOf } from './config.ts';
import { parseLine, type Line } from './slots.ts';

export { openState } from './legacy.ts';

async function refuse(notifier: Notifier, log: (line: Line) => void, why: Line): Promise<null> {
    log(why);
    await notifier.notify(must(parseText('Tab Recap')), must(parseText(why)));
    return null;
}

export async function openStateAt(root: Directory, notifier: Notifier, log: (line: Line) => void): Promise<Store | null> {
    const say = parseLineSink.bind(undefined, log);
    const store = stateStore(root, { daemonVersion: codeVersion(), log: say, closedDays: loadConfig().closedLaneDays });
    if (store.kind === 'newer-db') {
        store.db.close();
        return refuse(notifier, log, parseLine(`tab-recap: ${messagesOf().database.newer(store.backup)}`));
    }
    const outcome = importFiles(store, new LegacyFiles(root), { now: Date.now });
    if (outcome.kind === 'failed') {
        store.close();
        return refuse(notifier, log, parseLine(`tab-recap: could not move the state files into the database (${outcome.why}); they are untouched`));
    }
    if (outcome.kind === 'imported') {
        const { report } = outcome;
        log(parseLine(`imported ${report.recaps} recaps, ${report.views} views, ${report.requests + report.visibility} requests; the files are in ${outcome.movedTo ?? '?'}`));
    }
    return store;
}

export type LineSink = (line: Line) => void;

export function parseLineSink(log: LineSink, line: unknown): Line {
    const parsed = parseLine(line);
    log(parsed);
    return parsed;
}
