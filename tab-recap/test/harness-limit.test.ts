import { uncheckedBackendText } from '#src/recap/domain/ids.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { HarnessPortDecider } from '#src/adapters/job/decider.ts';
import { HarnessEnumerator } from '#src/adapters/job/enumerator.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { instructions } from '#src/adapters/job/prompts/recap-instructions.ts';
import type { Question } from '#src/ports/decider.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { BackendHarness, HarnessAsk, HarnessChoice, HarnessRun } from '#src/ports/harness.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { requestOf } from '#test/support.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { documentOf, textOf, noulOf } from './fakes/decider-fixtures.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';

const SETTINGS: HarnessChoice = { model: textOf(''), effort: 'low' };
const QUESTIONS: ReadonlyMap<Text, Question> = new Map<Text, Question>([[textOf('stuck'), noulOf('same step failing?', 'retries', 'progress')]]);
const LARGE = 1_000_000;

function limited(limit: number | null): { harness: BackendHarness; calls: HarnessAsk[] } {
    const calls: HarnessAsk[] = [];
    const harness: BackendHarness = {
        id: uncheckedBackendText('claude'), limit: limit === null ? null : must(parseCount(limit)), label: () => textOf('claude/default'),
        run: (call): Promise<HarnessRun> => { calls.push(call); return Promise.resolve({ kind: 'ran', text: textOf('{"stuck": 0.5}'), costUsd: must(parseUsd(0)) }); },
    };
    return { harness, calls };
}

test('a brief, curation, enumeration or decision longer than the harness limit is refused before the harness runs', async () => {
    const brief = limited(1);
    const briefed = await new HarnessBrief(brief.harness, SETTINGS).write(textOf('<compaction_input version="1"/>'));
    assert.ok(isUnknown(briefed) && briefed.why.why === 'unreadable');
    const curated = limited(1);
    const curate = await new HarnessCurator(curated.harness, SETTINGS).write(must(parseText('<curator_input version="1"/>')), 'reconcile');
    assert.ok(isUnknown(curate));
    const enumerated = limited(1);
    const enumerate = await new HarnessEnumerator(enumerated.harness, SETTINGS).write(must(parseText('<enumerate_input version="1"/>')));
    assert.ok(isUnknown(enumerate));
    const decided = limited(1);
    const decision = await new HarnessPortDecider(decided.harness, SETTINGS, () => instant(0)).ask(documentOf({ goal: 'merge' }), QUESTIONS);
    assert.ok(isUnknown(decision) && decision.why.why === 'unreadable');
    assert.deepEqual([brief.calls.length, curated.calls.length, enumerated.calls.length, decided.calls.length], [0, 0, 0, 0]);
});

test('a document within the harness limit runs once; a null limit never refuses', async () => {
    const fits = limited(LARGE);
    const briefed = await new HarnessBrief(fits.harness, SETTINGS).write(textOf('<compaction_input version="1"/>'));
    assert.equal(isUnknown(briefed), false);
    const unlimited = limited(null);
    const curated = await new HarnessCurator(unlimited.harness, SETTINGS).write(must(parseText('<curator_input version="1"/>')));
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
    assert.deepEqual(tight.calls[0], { instructions: instructions(request), input: writerContext(request, brand<number, 'Count'>(0)) });
});
