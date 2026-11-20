import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { NewerDatabase, StaleDatabase } from '#src/adapters/db/open.ts';
import type { Messages } from '#src/i18n/index.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { loadConfig, stateDirectory } from './config.ts';

export type CliOpened = Store | NewerDatabase | StaleDatabase;

export const openCliStore = (): CliOpened => openStoreAt(databaseFile(stateDirectory()), { closedDays: loadConfig().closedLaneDays }, 'reader');

export const notReadyText = (opened: NewerDatabase | StaleDatabase, messages: Messages): Text =>
    must(parseText(opened.kind === 'newer-db' ? messages.database.newer(opened.backup) : messages.database.stale(opened.found, opened.known)));

export function release(opened: NewerDatabase | StaleDatabase): void {
    if (opened.kind === 'newer-db') {
        opened.db.close();
        return;
    }
    opened.close();
}

export function notReadyLine(opened: NewerDatabase | StaleDatabase, messages: Messages): Text {
    release(opened);
    return notReadyText(opened, messages);
}
