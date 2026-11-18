import type { Case } from '@stateforge-labs/session-ledger/testkit';
import type { ReadOnlyResult, StoreSubject, StoreWorld } from './contract.ts';

type Run = Case<StoreWorld, StoreSubject>['run'];
type Body = (world: StoreWorld, subject: StoreSubject) => void;

export const sync = (body: Body): Run => (world, subject) => {
    body(world, subject);
    return Promise.resolve();
};

export const kase = (id: string, group: string, title: string, run: Run): Case<StoreWorld, StoreSubject> => ({ id, group, title, level: 'full', run });

export const withReader = (subject: StoreSubject, path: string, check: (probe: ReadOnlyResult) => void): void => {
    const probe = subject.openReadOnly(path);
    try {
        check(probe);
    } finally {
        probe.close();
    }
};
