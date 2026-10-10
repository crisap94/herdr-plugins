import type { Store } from '#src/adapters/db/database.ts';
import { stateStore } from '#src/adapters/db/database.ts';
import { importFiles } from '#src/adapters/db/import/import-files.ts';
import { LegacyFiles } from '#src/adapters/db/import/legacy-files.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import { messagesOf } from './config.ts';

async function refuse(notifier: Notifier, log: (line: string) => void, why: string): Promise<null> {
    log(why);
    await notifier.notify('Tab Recap', why);
    return null;
}

export async function openState(root: string, notifier: Notifier, log: (line: string) => void): Promise<Store | null> {
    const store = stateStore(root, { daemonVersion: codeVersion() });
    if (store.kind === 'newer-db') {
        store.db.close();
        return refuse(notifier, log, `tab-recap: ${messagesOf().database.newer(store.backup)}`);
    }
    const outcome = importFiles(store, new LegacyFiles(root), { now: Date.now });
    if (outcome.kind === 'failed') {
        store.close();
        return refuse(notifier, log, `tab-recap: could not move the state files into the database (${outcome.why}); they are untouched`);
    }
    if (outcome.kind === 'imported') {
        const { report } = outcome;
        log(`imported ${report.recaps} recaps, ${report.views} views, ${report.requests + report.visibility} requests; the files are in ${outcome.movedTo ?? '?'}`);
    }
    return store;
}
