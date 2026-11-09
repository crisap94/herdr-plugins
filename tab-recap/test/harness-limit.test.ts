import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { HarnessDecider } from '#src/adapters/job/decider.ts';
import { HarnessEnumerator } from '#src/adapters/job/enumerator.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { instructions } from '#src/adapters/job/prompts/recap-instructions.ts';
import type { Noul } from '#src/ports/decider.ts';
import type { Harness, HarnessCall, Ran } from '#src/ports/harness.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { requestOf } from '#test/support.ts';

const SETTINGS = { model: '', effort: 'low' } as const;
const QUESTIONS: Record<string, Noul> = { stuck: { instructions: { question: 'same step failing?' }, criteria: { true: 'retries', false: 'progress' } } };
const LARGE = 1_000_000;

function limited(limit: number | null): { harness: Harness<'claude'>; calls: HarnessCall[] } {
    const calls: HarnessCall[] = [];
    const harness: Harness<'claude'> = {
        id: 'claude', limit, label: () => 'claude/default',
        run: (call): Promise<Ran> => { calls.push(call); return Promise.resolve({ kind: 'ran', text: '{"stuck": 0.5}', costUsd: 0 }); },
    };
    return { harness, calls };
}

test('a brief, curation, enumeration or decision longer than the harness limit is refused before the harness runs', async () => {
    const brief = limited(1);
    const briefed = await new HarnessBrief(brief.harness, SETTINGS).write('<compaction_input version="1"/>');
    assert.ok(isUnknown(briefed) && briefed.why.why === 'unreadable');
    const curated = limited(1);
    const curate = await new HarnessCurator(curated.harness, SETTINGS).write('<curator_input version="1"/>', 'reconcile');
    assert.ok(isUnknown(curate));
    const enumerated = limited(1);
    const enumerate = await new HarnessEnumerator(enumerated.harness, SETTINGS).write('<enumerate_input version="1"/>');
    assert.ok(isUnknown(enumerate));
    const decided = limited(1);
    const decision = await new HarnessDecider(decided.harness, SETTINGS, () => 0).ask({ goal: 'merge' }, QUESTIONS);
    assert.ok(isUnknown(decision) && decision.why.why === 'unreadable');
    assert.deepEqual([brief.calls.length, curated.calls.length, enumerated.calls.length, decided.calls.length], [0, 0, 0, 0]);
});

test('a document within the harness limit runs once; a null limit never refuses', async () => {
    const fits = limited(LARGE);
    const briefed = await new HarnessBrief(fits.harness, SETTINGS).write('<compaction_input version="1"/>');
    assert.equal(isUnknown(briefed), false);
    const unlimited = limited(null);
    const curated = await new HarnessCurator(unlimited.harness, SETTINGS).write('<curator_input version="1"/>');
    assert.equal(isUnknown(curated), false);
    assert.deepEqual([fits.calls.length, unlimited.calls.length], [1, 1]);
});

test('the recap writer shrinks its context until the call fits the harness limit, down to an empty transcript budget', async () => {
    const request = requestOf();
    const fitting = limited(LARGE);
    const written = await new RecapWriter(fitting.harness, SETTINGS).write(request);
    assert.equal(isUnknown(written), false);
    assert.deepEqual(fitting.calls[0], { instructions: instructions(request), input: writerContext(request, TRANSCRIPT_BUDGET) });
    const tight = limited(1);
    const shrunk = await new RecapWriter(tight.harness, SETTINGS).write(request);
    assert.equal(isUnknown(shrunk), false);
    assert.deepEqual(tight.calls[0], { instructions: instructions(request), input: writerContext(request, 0) });
});
