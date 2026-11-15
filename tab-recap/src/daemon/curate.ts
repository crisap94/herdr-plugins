import type { Store } from '#src/adapters/db/database.ts';
import type { Curators } from '#src/ports/curators.ts';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { Curate } from '#src/recap/application/curate.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { loadConfig } from './config.ts';

interface CurateParts {
    readonly store: Store;
    readonly curator: () => Curators | null;
    readonly transcripts: TranscriptRegistry;
    log(line: string): void;
}

export function wireCurate(parts: CurateParts): Curate {
    const { store } = parts;
    return new Curate({
        records: store.records, ledger: store.ledger, stories: store.stories, writer: parts.curator, clock: () => Date.now(),
        zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone, language: () => loadConfig().recapLanguage, rubric: RUBRIC.items, tail: (lanes) => tailOf(parts.transcripts, lanes), every: () => loadConfig().reconcileEvery, repair: () => loadConfig().curatorRepair, log: (line) => { parts.log(line); },
    });
}
