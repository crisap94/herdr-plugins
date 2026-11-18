import { test } from 'node:test';
import { runConformance } from '@stateforge-labs/session-ledger/testkit';
import { storeMechanismCases } from '@stateforge-labs/session-ledger-sqlite/testkit';
import { pendingOf, pluginStoreSubject, STORE_MECHANISM_GROUPS } from './subject.ts';

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeMechanismCases,
    subject: pluginStoreSubject,
    pending: pendingOf(STORE_MECHANISM_GROUPS),
});
