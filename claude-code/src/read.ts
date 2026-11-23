import { existsSync } from 'node:fs';
import { createEngine } from '../../packages/session-ledger/src/recap/application/engine.ts';
import type { Engine } from '../../packages/session-ledger/src/recap/application/engine.ts';
import { connectReadOnly } from '../../tab-recap/src/adapters/db/connection.ts';
import { storeOver } from '../../tab-recap/src/adapters/db/database.ts';
import { capabilityWording } from '../../packages/session-ledger/src/ports/capability-reasons.ts';
import { TranscriptRegistry } from '../../packages/session-ledger/src/ports/transcript-registry.ts';
import type { Clock } from '../../packages/session-ledger/src/ports/clock.ts';
import type { Summarizer } from '../../packages/session-ledger/src/ports/summarizer.ts';
import { FULL_WRITER_VIEW } from '../../packages/session-ledger/src/recap/domain/writer-view.ts';
import { gitRepos, ledgerPathOf } from './compose.ts';

export type ReadEngine = Pick<Engine, 'restore' | 'history'>;

export type ReadOpening =
    | { readonly kind: 'absent' }
    | { readonly kind: 'opened'; readonly engine: ReadEngine; close(): void }
    | { readonly kind: 'failed'; readonly detail: string };

const NO_TRANSCRIPTS = new TranscriptRegistry({}, null, (kind): string => capabilityWording('history-unavailable', kind));

const noWriter = (): Summarizer => {
    throw new Error('the ledger is open for reading only');
};

const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function openForReading(stateDir: string, clock: Clock, log: (line: string) => void): ReadOpening {
    const path = ledgerPathOf(stateDir);
    if (!existsSync(path)) {
        return { kind: 'absent' };
    }
    try {
        const db = connectReadOnly(path);
        const store = storeOver(db, { now: () => clock.now(), log });
        const engine = createEngine({
            source: { transcripts: NO_TRANSCRIPTS },
            store: { records: store.records, ledger: store.ledger },
            models: { summarizer: noWriter },
            environment: { clock, repos: gitRepos(clock), log },
            settings: { language: () => 'en', writerView: () => FULL_WRITER_VIEW },
        });
        return { kind: 'opened', engine, close: (): void => { db.close(); } };
    } catch (error) {
        return { kind: 'failed', detail: `the ledger at ${path} cannot be read: ${detailOf(error)}` };
    }
}

export function readingWith<T>(stateDir: string, clock: Clock, log: (line: string) => void, use: (engine: ReadEngine) => T, otherwise: T): T {
    const opening = openForReading(stateDir, clock, log);
    if (opening.kind === 'failed') {
        log(opening.detail);
        return otherwise;
    }
    if (opening.kind === 'absent') {
        return otherwise;
    }
    try {
        return use(opening.engine);
    } finally {
        opening.close();
    }
}
