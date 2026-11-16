import { test } from 'node:test';
import { storeCases, runConformance } from '@stateforge-labs/session-ledger/testkit';
import { STORE_GROUPS, pendingOf, sqliteStoreSubject } from './subject.ts';

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeCases,
    subject: sqliteStoreSubject,
    pending: pendingOf(STORE_GROUPS),
});
