import { test } from 'node:test';
import { createFakeEngine } from '@stateforge-labs/session-ledger/testkit';
import { hostCases } from '../testkit/index.ts';

for (const row of hostCases) {
    test(`${row.id} ${row.title}`, async () => {
        await row.run(createFakeEngine());
    });
}
