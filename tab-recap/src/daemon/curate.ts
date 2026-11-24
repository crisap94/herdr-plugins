import type { Store } from '#src/adapters/db/database.ts';
import type { Curators } from '@stateforge-labs/session-ledger';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { CurateTasks } from '#src/recap/application/curate.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
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
