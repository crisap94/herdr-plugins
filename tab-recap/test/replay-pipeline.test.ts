import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import { parseEval } from '#src/recap/application/eval-options.ts';
import { replay } from '#src/recap/application/replay.ts';
import type { Replayed, ReplayDeps } from '#src/recap/application/replay.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { FULL_WRITER_VIEW, keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';
import { NO_REPOS } from '#test/support.ts';
import { answer, scripted } from '#test/fakes/enumerator.ts';

const FILE = join(import.meta.dirname, 'fixtures', 'replay-claude.jsonl');

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six'];
const candidateFor = (document: string, call: number): string => answer([{ section: 'done', text: `Candidate number ${NUMBERS[call - 1] ?? 'more'}`, anchor: /<turn[^>]*>([^<.]{8,60})/.exec(document)?.[1] ?? '' }]);

function adding(): { summarizer: Summarizer; seen: RecapRequest[] } {
    const seen: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request): Promise<Written> => {
            seen.push(request);
            const picked = request.input.candidates?.[0];
            const first = request.input.transcripts[0]?.entries[0]?.text.split(/\s+/).slice(0, 5).join(' ') ?? '';
            const op = picked === undefined ? { op: 'add', anchor: first, section: 'done', text: ['Wrote the cart schema', 'Opened the checkout flow', 'Tested guests baskets', 'Shipped the invoice export', 'Reviewed pricing rules', 'Merged the tax fix'][seen.length - 1] ?? 'More work' } : { op: 'add', anchor: picked.anchor, section: picked.section, text: picked.text };
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [op] }), costUsd: 0.25 });
        },
    };
    return { summarizer, seen };
}

interface Ran {
    readonly done: Replayed;
    readonly seen: RecapRequest[];
    readonly documents: string[];
}

async function run(pipeline: Pipeline | undefined, writerView: WriterView, mergeTurns = 1): Promise<Ran> {
    const { summarizer, seen } = adding();
    const enumerating = scripted([candidateFor]);
    const scratch = scratchStore();
    try {
        const deps: ReplayDeps = { reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, repos: NO_REPOS, language: 'en', log: () => undefined, enumerator: () => enumerating.enumerator, ...(pipeline === undefined ? {} : { pipeline }), writerView };
        const done = await replay(deps, FILE, 'replay:t1', statSync(FILE).size, mergeTurns);
        return { done, seen, documents: enumerating.documents };
    } finally {
        scratch.dispose();
    }
}

test('--pipeline is parsed, checked, and goes with --replay only', () => {
    assert.deepEqual(parseEval(['--replay', 'x.jsonl', '--pipeline', 'full']), { kind: 'options', options: { mode: 'replay', count: 20, tab: null, since: null, json: false, replay: 'x.jsonl', kind: null, compareImported: null, pipeline: 'full', mergeTurns: 1, check: null, prune: false } });
    assert.ok(parseEval(['--replay', 'x.jsonl', '--prune']).kind === 'options');
    for (const name of ['one', 'enumerate', 'enumerate+gates', 'full']) {
        const parsed = parseEval(['--replay', 'x.jsonl', '--pipeline', name]);
        assert.ok(parsed.kind === 'options' && parsed.options.pipeline === name, name);
    }
    const bad = parseEval(['--replay', 'x.jsonl', '--pipeline', 'fast']);
    assert.ok(bad.kind === 'usage' && /--pipeline takes one, enumerate, enumerate\+gates, full/.test(bad.why));
    const alone = parseEval(['--pipeline', 'one']);
    assert.ok(alone.kind === 'usage' && /go with --replay/.test(alone.why));
    const without = parseEval(['--replay', 'x.jsonl']);
    assert.ok(without.kind === 'options' && without.options.pipeline === null);
    assert.ok(parseEval(['--prune']).kind === 'usage');
});

test('a pruned replay input hides older facts and reports the count without changing the ledger', async () => {
    const { done, seen } = await run('one', prunedWriterView(keepNewestOf(2), nextHoursOf(24)));
    assert.equal(done.facts.length, 6);
    const hidden = seen.flatMap((request) => request.input.ledgers[0]?.hidden?.get('done') ?? []);
    assert.ok(hidden.length > 0);
    assert.equal(hidden.at(-1), 3);
    assert.equal(seen.at(-1)?.input.ledgers[0]?.facts.length, 2);
});

test('--merge-turns is a positive whole number and goes with --replay', () => {
    const merged = parseEval(['--replay', 'x.jsonl', '--merge-turns', '2']);
    assert.ok(merged.kind === 'options' && merged.options.mergeTurns === 2);
    for (const [flag, value] of [['--merge-turns', '0'], ['--merge-turns=-1', ''], ['--merge-turns', '1.2'], ['--merge-turns', 'no']] as const) {
        const invalid = parseEval(['--replay', 'x.jsonl', flag, ...(value === '' ? [] : [value])]);
        assert.ok(invalid.kind === 'usage' && /--merge-turns takes a whole number above 0/.test(invalid.why), value);
    }
    const aloneMerge = parseEval(['--merge-turns', '2']);
    assert.ok(aloneMerge.kind === 'usage' && /go with --replay/.test(aloneMerge.why));
});

test('replay with --merge-turns 1 preserves the per-turn writer calls and 2 groups adjacent turns', async () => {
    const control = await run('one', FULL_WRITER_VIEW, 1);
    assert.equal(control.done.turns, 6);
    assert.equal(control.done.windows, 6);
    assert.equal(control.seen.length, 6);
    const merged = await run('one', FULL_WRITER_VIEW, 2);
    assert.equal(merged.done.turns, 6);
    assert.equal(merged.done.windows, 3);
    assert.equal(merged.seen.length, 3);
});

test('replay with --pipeline full on the 6-turn fixture: every turn enumerated, the writer reconciles the candidates, the cost is summed', async () => {
    const { done, seen, documents } = await run('full', FULL_WRITER_VIEW);
    assert.equal(done.windows, 6);
    assert.equal(documents.length, 6, 'one enumeration call per turn (each turn is one short chunk with enough candidates)');
    assert.ok(seen.every((request) => request.input.candidates?.length === 1));
    assert.deepEqual(done.facts.map((fact) => fact.text), ['Candidate number one', 'Candidate number two', 'Candidate number three', 'Candidate number four', 'Candidate number five', 'Candidate number six']);
    assert.ok(Math.abs(done.costUsd - (6 * 0.25 + 6 * 0.01)) < 1e-9, `${done.costUsd}`);
});

test('replay with --pipeline one, or none named: the single call, the enumeration is never asked', async () => {
    for (const pipeline of ['one', undefined] as const) {
        const { done, seen, documents } = await run(pipeline, FULL_WRITER_VIEW);
        assert.equal(documents.length, 0, pipeline ?? 'the job\'s default is one: nothing is enumerated');
        assert.equal(seen.length, 6);
        assert.ok(done.costUsd > 0);
    }
});
