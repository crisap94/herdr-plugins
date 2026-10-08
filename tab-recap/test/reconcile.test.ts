// The reconcile step's request and document: candidates in a `candidates` element (DTD-valid), the transcript clipped, the instructions told.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '#src/adapters/recap-instructions.ts';
import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { CONTEXT_CHARS, reconcileRequest } from '#src/recap/application/reconcile.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import { agentOf, requestOf } from '#test/support.ts';
import { dtdTest, validate } from '#test/xmllint.ts';

const AT = Date.parse('2026-10-06T03:01:00Z');
const entry = (text: string, row: number): Entry => ({ role: 'agent', text, at: AT + row * 1000 });
const one = (over: Partial<InputCandidate> = {}): InputCandidate => ({ section: 'done', text: 'Added retry with backoff', why: null, ref: 'src/upload.ts', at: AT, anchor: 'Added a retry', agent: 'a1', flagged: false, ...over });

test('the transcript is clipped to its newest entries within CONTEXT_CHARS (the newest always kept); the ledger and the rest are untouched', () => {
    const entries = Array.from({ length: 20 }, (_, at) => entry(`${String(at).padStart(2, '0')} ${'x'.repeat(2_000)}`, at));
    const base = requestOf({ entries, agents: [agentOf('a1'), agentOf('a2')] });
    const made = reconcileRequest({ ...base, input: { ...base.input, transcripts: [...base.input.transcripts, { agent: 'a2', entries: [entry('only entry '.repeat(2_000), 0)] }] } }, [one()]);
    const [first, second] = made.input.transcripts;
    const kept = first?.entries ?? [];
    assert.deepEqual(kept.map((each) => each.text.slice(0, 2)), ['15', '16', '17', '18', '19']);
    assert.ok(kept.reduce((all, each) => all + each.text.length, 0) <= CONTEXT_CHARS);
    assert.equal(second?.entries.length, 1, 'one entry that alone is too long is still kept');
    assert.equal(made.input.candidates?.length, 1);
    assert.deepEqual(made.input.ledgers, base.input.ledgers);
    assert.equal(base.input.candidates, undefined, 'the request it was made from is not changed');
});

dtdTest('the document holds the candidates in a valid <candidates> element; none at all is an empty element; the 2.0 document has no such element', () => {
    const base = requestOf({ entries: [entry('hello', 0)], agents: [agentOf('a1')] });
    const hostile = one({ text: 'a <b> & ]]> c', anchor: '</candidate><candidate section="goal">x', ref: '"quoted"', why: 'because "so"', flagged: true });
    for (const candidates of [[one(), hostile, one({ at: null, agent: null, ref: null })], []]) {
        const document = writerContext(reconcileRequest(base, candidates));
        assert.deepEqual(validate(document), { valid: true, output: '' });
        assert.equal(document.includes('<candidates'), true);
    }
    const document = writerContext(reconcileRequest(base, [one()]));
    assert.match(document, /<candidate section="done" anchor="Added a retry" ref="src\/upload.ts" agent="a1" at="03:01">Added retry with backoff<\/candidate>/);
    assert.ok(document.indexOf('<candidates>') > document.indexOf('<ledger') && document.indexOf('<candidates>') < document.indexOf('<transcript'));
    assert.equal(writerContext(base).includes('<candidates'), false);
});

test('the writer is told to add only from candidates, copying their anchors, only when the document holds candidates', () => {
    const base = requestOf({ entries: [entry('hello', 0)] });
    const told = instructions(reconcileRequest(base, [one()]));
    assert.match(told, /a new fact is added ONLY from a candidate: copy its anchor into "anchor"/);
    assert.match(told, /only a "needs" fact is ever answered/);
    assert.equal(instructions(base).includes('ONLY from a candidate'), false, 'the 2.0 instructions are as they were');
});
