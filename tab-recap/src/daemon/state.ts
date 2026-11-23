import type { Store } from '#src/adapters/db/database.ts';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { importFilesAt } from '#src/adapters/db/import/import-files.ts';
import { LegacyStoreFiles } from '#src/adapters/db/import/legacy-files.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { must } from '#src/protocol/result.ts';
import type { NotifierPort } from '#src/ports/notifier.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parsePid, type Pid } from '#src/recap/domain/pid.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { loadSettings, messagesOf } from './config.ts';
import { parseLine, type Line } from './slots.ts';

export const OWN_PID: Pid = must(parsePid(process.pid));

async function refuse(notifier: NotifierPort, log: (line: Line) => void, why: Line): Promise<null> {
    log(why);
    await notifier.notify(must(parseText('Tab Recap')), must(parseText(why)));
    return null;
}

export async function openStateAt(root: Directory, notifier: NotifierPort, log: (line: Line) => void): Promise<Store | null> {
    const version = codeVersion();
    const say = parseLineSink.bind(undefined, log);
    const store = openStoreAt(databaseFile(root), { daemonVersion: version, log: say, closedDays: loadSettings().closedLaneDays });
    if (store.kind === 'newer-db') {
        store.db.close();
        return refuse(notifier, log, parseLine(`tab-recap: ${messagesOf().database.newer(store.backup === null ? null : must(parseText(store.backup)))}`));
    }
    const outcome = importFilesAt(store, new LegacyStoreFiles(must(parseFsPath(root))), { now: () => instant(Date.now()) });
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
