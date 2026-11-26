import { existsSync } from 'node:fs';
import { must, parseText, type Clock, type Engine, type Records, type Writer } from '@stateforge-labs/session-ledger';
import { composeEngine, ledgerPathOf, randomIds } from './compose.ts';
import type { Composed, HostPlugs } from './compose.ts';
import { gitWorkplaces, restoreBytes, restoreText } from './plugs.ts';

export interface ReadEngine {
    readonly engine: Pick<Engine, 'follow' | 'compacted'>;
    readonly records: Pick<Records, 'lastRunOf'>;
    readonly openFacts: Composed['openFacts'];
}

export type ReadOpening =
    | { readonly kind: 'absent' }
    | { readonly kind: 'opened'; readonly reading: ReadEngine; close(): void }
    | { readonly kind: 'failed'; readonly detail: string };

const refusingWriter = (): Writer => {
    throw new Error('the ledger is open for reading only');
};

const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function openForReading(stateDir: string, clock: Clock, log: (line: string) => void): ReadOpening {
    const path = ledgerPathOf(stateDir);
    if (!existsSync(path)) {
        return { kind: 'absent' };
    }
    const plugs: HostPlugs = {
        stateDir,
        records: path,
        writer: refusingWriter,
        language: () => must(parseText('en')),
        clock,
        workplaces: gitWorkplaces(clock),
        ids: randomIds,
        log,
        restore: { text: restoreText, bytes: restoreBytes },
    };
    try {
        const composed = composeEngine(plugs, 'reading');
        if (composed.kind === 'refused') {
            return { kind: 'failed', detail: composed.detail };
        }
        return { kind: 'opened', reading: { engine: composed.engine, records: composed.records, openFacts: composed.openFacts }, close: (): void => { composed.close(); } };
    } catch (error) {
        return { kind: 'failed', detail: `the ledger at ${path} cannot be read: ${detailOf(error)}` };
    }
}

export function readingWith<T>(stateDir: string, clock: Clock, log: (line: string) => void, use: (reading: ReadEngine) => T, otherwise: T): T {
    const opening = openForReading(stateDir, clock, log);
    if (opening.kind === 'failed') {
        log(opening.detail);
        return otherwise;
    }
    if (opening.kind === 'absent') {
        return otherwise;
    }
    try {
        return use(opening.reading);
    } finally {
        opening.close();
    }
}
