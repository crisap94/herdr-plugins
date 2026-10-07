// TAB_RECAP_CUSTOM_CMD: the command gets the version 2 document and must answer operations; the 1.x recap shape is refused with a line naming the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { RecapWriter } from '#src/adapters/recap-writer.ts';
import { extract, OLD_CONTRACT } from '#src/recap/application/extract-job.ts';
import type { Extracted, Ground } from '#src/recap/application/extract-job.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import { scratchDir } from '#test/db/support.ts';
import { requestOf } from './support.ts';

const ground: Ground = {
    gates: LEDGER_GATES, now: 1,
    resolving: { tasks: ['t1'], agents: [], taskOf: new Map(), turns: [], clock: { now: 1, zone: 'UTC' } },
    grounds: [{ key: 't1', tab: 'w1:t1', shown: new Map(), closedLately: [], language: 'en', agents: [] }],
};

/** A command that reads the document on stdin and prints `answer(document)`. */
async function through(script: string): Promise<Extracted> {
    const dir = scratchDir('custom');
    try {
        const file = join(dir, 'writer.mjs');
        writeFileSync(file, `import { readFileSync } from 'node:fs';\nconst document = readFileSync(0, 'utf8');\n${script}`);
        const writer = new RecapWriter(new CustomHarness(`${process.execPath} ${file}`, dir, 20_000), { model: '', effort: 'default' });
        return await extract(writer, requestOf({ entries: [{ role: 'user', text: 'go' }] }), ground);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('a command that reads the version 2 document and prints operations is applied', async () => {
    const done = await through(`console.log(JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: document.includes('<recap_input version="2">') && document.includes('<ledger/>') ? 'got the v2 document' : 'wrong document' }] }));`);
    assert.ok(done.kind === 'ops');
    assert.deepEqual(done.tasks[0]?.ops.map((op) => (op.op === 'add' ? op.text : '')), ['got the v2 document']);
});

test('a command that still prints the 1.x recap fails the run with the contract line, once, and stores nothing', async () => {
    const done = await through(`console.log(JSON.stringify({ goal: 'old', now: [], needs: [], done: [], decisions: [], next: [], links: [] }));`);
    assert.deepEqual([done.kind, done.kind === 'failed' ? done.error : ''], ['failed', OLD_CONTRACT]);
});
