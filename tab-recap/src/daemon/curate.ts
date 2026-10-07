// The composition of the curator: the daemon's store and job, handed to the one service that curates a tab's tasks.
import type { Store } from '#src/adapters/db/database.ts';
import type { Curators } from '#src/ports/curators.ts';
import { RUBRIC } from '#src/adapters/rubric.ts';
import { Curate } from '#src/recap/application/curate.ts';
import { loadConfig } from './config.ts';

export function wireCurate(parts: { readonly store: Store; readonly curator: () => Curators | null; log(line: string): void }): Curate {
    const { store } = parts;
    return new Curate({
        records: store.records, ledger: store.ledger, stories: store.stories, writer: parts.curator, clock: () => Date.now(),
        zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone, language: () => loadConfig().recapLanguage, rubric: RUBRIC.items, log: (line) => { parts.log(line); },
    });
}
