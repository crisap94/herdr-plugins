import { test } from 'node:test';
import { engineCases, runConformance } from '@stateforge-labs/session-ledger/testkit';
import { ENGINE_GROUPS, pendingOf, pluginSubject } from './subject.ts';

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: engineCases,
    subject: pluginSubject,
    pending: pendingOf(ENGINE_GROUPS),
});
