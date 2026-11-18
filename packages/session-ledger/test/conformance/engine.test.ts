import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createEngine } from '@stateforge-labs/session-ledger';
import { createEngineWorld, engineCases, runConformance } from '@stateforge-labs/session-ledger/testkit';
import { contractFold } from '@stateforge-labs/session-ledger/unstable/facade/plugs.ts';

const GROUPS: readonly string[] = ['FOL', 'TRN', 'STA', 'FBY', 'EVT', 'CMP', 'CUR', 'HIS', 'REF', 'RUN', 'CSR', 'LNG', 'RDF', 'PRT', 'LED'];

const pendingDir = new URL('../../../../tab-recap/test/conformance/', import.meta.url);

const idsOf = (group: string): readonly string[] => {
    const parsed: unknown = JSON.parse(readFileSync(new URL(`pending-${group}.json`, pendingDir), 'utf8'));
    if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === 'string')) {
        throw new Error(`pending-${group}.json is not an array of ids`);
    }
    return parsed;
};

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: engineCases,
    subject: {
        name: 'package engine',
        level: 'full',
        world: () => createEngineWorld({ fold: contractFold }),
        create: (world) => createEngine(world.plugs),
    },
    pending: GROUPS.flatMap(idsOf),
});
