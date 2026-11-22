import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunksOf } from '@stateforge-labs/session-ledger/unstable/recap/application/chunking.ts';
import { enumerateInput, stubId } from '@stateforge-labs/session-ledger/unstable/recap/application/enumerate-input.ts';
import type { EnumerateMaterial } from '@stateforge-labs/session-ledger/unstable/recap/application/enumerate-input.ts';
import { itemsOf, transcriptOf, turnsOf } from '@stateforge-labs/session-ledger/unstable/recap/application/writer-transcript.ts';
import type { Clock } from '@stateforge-labs/session-ledger/unstable/recap/application/writer-transcript.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Entry } from '@stateforge-labs/session-ledger/unstable/ports/legacy.ts';

const text = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

const NOW = 1_700_000_000_000;
const clock: Clock = { now: instant(NOW), zone: text('UTC') };
const tab = { id: text('tab-1'), now: instant(NOW), zone: text('UTC') };
const turnClock = { now: instant(NOW), zone: text('UTC') };

const entries: readonly Entry[] = [
    { role: 'user', text: 'Fix the CI', at: NOW },
    { role: 'tool', text: '', kind: 'edit', what: 'src/a.ts' },
    { role: 'tool', text: '', kind: 'edit', what: 'src/b.ts' },
    { role: 'agent', text: 'Done', at: NOW },
];

test('the items group consecutive tool calls into one burst between the turns', () => {
    const items = itemsOf(entries, clock);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((item) => item.turn), [true, false, true]);
});

test('a transcript names its agent and carries the turns', () => {
    const transcript = transcriptOf(text('claude'), entries, clock, count(60_000));
    assert.match(transcript, /^<transcript agent="claude"/);
    assert.match(transcript, /Fix the CI/);
    assert.match(transcript, /Done/);
});

test('a tight budget omits the oldest turns and says how many', () => {
    const shown = turnsOf(entries, clock, count(1));
    assert.equal(shown.attrs.omitted, 2);
    assert.equal(turnsOf(entries, clock, count(60_000)).attrs.omitted, null);
});

test('the enumerate input carries the tab, the chunk and the questions', () => {
    const [chunk] = chunksOf(entries, turnClock);
    assert.ok(chunk !== undefined);
    const material: EnumerateMaterial = {
        language: text('en'),
        tab,
        agent: text('claude'),
        chunk,
        position: { index: count(1), of: count(1) },
        stubs: [],
        questions: [{ id: text('q1'), text: text('Which file?') }],
    };
    const document = enumerateInput(material);
    assert.match(document, /^<enumerate_input version="1" language="en"/);
    assert.match(document, /<chunk agent="claude" index="1" of="1"/);
    assert.match(document, /<question id="q1">Which file\?<\/question>/);
});

test('stub ids count from one', () => {
    assert.equal(stubId(count(0)), 'g1');
    assert.equal(stubId(count(4)), 'g5');
});
