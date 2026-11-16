import { test } from 'node:test';
import { storeCases, runConformance } from '@stateforge-labs/session-ledger/testkit';
import { memoryStoreSubject } from './subject.ts';

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeCases,
    subject: memoryStoreSubject,
    pending: [],
});
