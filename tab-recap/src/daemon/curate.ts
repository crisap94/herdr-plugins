import type { Store } from '#src/adapters/db/database.ts';
import type { Curators } from '#src/ports/curators.ts';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { CurateTasks } from '#src/recap/application/curate.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { loadSettings } from './config.ts';

interface CurateParts {
    readonly store: Store;
    readonly curator: () => Curators | null;
    readonly transcripts: TranscriptRegistry;
    readonly log: (line: Text) => void;
}

export function wireCurate(parts: CurateParts): CurateTasks {
    const { store } = parts;
    return new CurateTasks({
        records: store.records, ledger: store.ledger, stories: store.stories, writer: parts.curator, clock: () => instant(Date.now()),
        zone: () => must(parseText(Intl.DateTimeFormat().resolvedOptions().timeZone)), language: () => must(parseText(loadSettings().recapLanguage)), rubric: RUBRIC.items, tail: (lanes) => tailOf(parts.transcripts, lanes), every: () => must(parseCount(loadSettings().reconcileEvery)), repair: () => loadSettings().curatorRepair, log: parts.log,
    });
}
