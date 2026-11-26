import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fact } from '@stateforge-labs/session-ledger';
import { composeEngine, followedOf } from '../../src/compose.ts';
import { TURNS, tempHost } from './host.ts';
import type { TempHost } from './host.ts';

export const PAYLOADS = join(import.meta.dirname, '..', 'fixtures', 'payloads');

export const payloadOf = (name: string): string => readFileSync(join(PAYLOADS, `${name}.json`), 'utf8');

export interface Kept {
    readonly host: TempHost;
    readonly open: readonly Fact[];
    readonly lastRunAt: number | null;
}

export async function keptLedger(session: string): Promise<Kept> {
    const host = tempHost(session);
    const composed = composeEngine(host.plugs);
    if (composed.kind !== 'ready') {
        throw new Error('the scratch ledger is newer than the code');
    }
    const followed = followedOf(host.hook);
    composed.engine.follow(followed.scope, followed.session);
    try {
        for (const turn of [0, 1, 2]) {
            host.grow(TURNS.slice(turn * 2, turn * 2 + 2));
            await composed.engine.refresh(followed.scope);
        }
        const last = composed.records.lastRunOf(followed.scope);
        return { host, open: composed.openFacts(followed.scope, followed.session.key), lastRunAt: last === null || 'kind' in last ? null : last.at };
    } finally {
        composed.close();
    }
}
