import { test } from 'node:test';
import { createMemoryStore, runConformance, storeCases, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';

const subject: Subject<null, StoreUnderTest> = {
    name: 'memory',
    level: 'full',
    world: () => null,
    create: () => createMemoryStore(),
};

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeCases.filter((kase) => kase.needsFold !== true),
    subject,
    pending: [],
});
