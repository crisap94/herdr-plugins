import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RestoreFacts } from '../../../tab-recap/src/recap/application/engine.ts';
import { composeEngine, followedOf } from '../../src/compose.ts';
import { TURNS, tempHost } from './host.ts';
import type { TempHost } from './host.ts';

export const PAYLOADS = join(import.meta.dirname, '..', 'fixtures', 'payloads');

export const payloadOf = (name: string): string => readFileSync(join(PAYLOADS, `${name}.json`), 'utf8');

export interface Kept {
    readonly host: TempHost;
    readonly facts: RestoreFacts;
}

export async function keptLedger(session: string): Promise<Kept> {
    const host = tempHost(session);
    const composed = composeEngine(host.plugs);
    if (composed.kind !== 'ready') {
        throw new Error('the scratch ledger is newer than the code');
    }
    const followed = followedOf(host.hook);
    try {
        for (const turn of [0, 1, 2]) {
            host.grow(TURNS.slice(turn * 2, turn * 2 + 2));
            await composed.engine.refresh(followed.scope, [followed.session]);
        }
        return { host, facts: composed.engine.restore(followed.scope, followed.session) };
    } finally {
        composed.close();
    }
}
