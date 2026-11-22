import type { Curator, CuratorMode } from '@stateforge-labs/session-ledger';
import type { Behaviour, Run } from './behaviour.ts';
import { failure } from './values.ts';

export type CuratedAnswer = { readonly kind: 'curated'; readonly text: string };

export interface CuratorCall {
    readonly document: string;
    readonly mode: CuratorMode | undefined;
}

const UNPLUGGED: Behaviour<CuratedAnswer> = { kind: 'fail', why: failure(1, 'no curator is plugged') };

export const curatorOf = (run: Run, record: (call: CuratorCall) => void, plugged: () => boolean, answer: (call: CuratorCall) => Behaviour<CuratedAnswer> | null): Curator | null => {
    if (!plugged()) {
        return null;
    }
    return {
        backend: 'scripted',
        write: (document: string, mode?: CuratorMode) => {
            const call: CuratorCall = { document, mode };
            record(call);
            return run(answer(call) ?? UNPLUGGED);
        },
    };
};
