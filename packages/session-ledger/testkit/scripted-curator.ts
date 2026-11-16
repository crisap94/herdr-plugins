import type { Curator } from '@stateforge-labs/session-ledger';
import type { Behaviour, Run } from './behaviour.ts';

export type CuratedAnswer = { readonly kind: 'curated'; readonly text: string };

const UNPLUGGED: Behaviour<CuratedAnswer> = { kind: 'fail', why: { why: 'failed', code: 1, detail: 'no curator is plugged' } };

export const curatorOf = (run: Run, record: (document: string) => void, scripted: () => Behaviour<CuratedAnswer> | null): Curator | null => {
    if (scripted() === null) {
        return null;
    }
    return {
        backend: 'scripted',
        write: (document: string) => {
            record(document);
            return run(scripted() ?? UNPLUGGED);
        },
    };
};
