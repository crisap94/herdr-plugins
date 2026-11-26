import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings } from '#src/daemon/config.ts';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger';
import { answer } from '#test/fakes/enumerator.ts';
import { backendsWorld, type BackendsWorld } from '../support/backends-world.ts';
import { judgingWorld, type EvalWorld } from '../support/eval-world.ts';
import { FILE, golden, matches, replayPath, replayRun, transcriptOf } from '../support/replay-world.ts';

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six'];
const OPEN_FACT = 'Migration test fails on the staging database';
const QUESTIONS = ['What is the goal?', 'What is waiting on the operator?', 'What must not be done?', 'Why was the most important decision taken?', 'What is the next action?'];

const stepsOf = (count: number): readonly string[] => Array.from({ length: count }, (_, at) => `Step ${at}: reworked part ${at} of the importer in src/import/part${at}.ts and ran its tests, which pass after the change to the queue size.`);
const quote = (document: string): string => /<turn[^>]*>([^<.]{8,40})/.exec(document)?.[1] ?? '';
const plenty = (document: string, call: number): string => answer(Array.from({ length: 8 }, (_, at) => ({ section: 'done', text: `Reworked part ${call}.${at}`, anchor: quote(document) })));
const reconcileEvery = (settings: BackendsWorld, ...lines: readonly string[]): number => {
    settings.write(`${lines.join('\n')}\n`);
    return loadSettings().reconcileEvery;
};
const chunksIn = (documents: readonly string[]): readonly string[] => documents.filter((document) => !document.includes('<questions>')).flatMap((document) => [...document.matchAll(/<chunk [^>]*>([\s\S]*?)<\/chunk>/g)].map((found) => found[1] ?? ''));
const asked = (documents: readonly string[]): readonly string[] => documents.filter((document) => document.includes('<questions>'));

describe('the full pipeline replays the six turns', () => {
    test('every turn is enumerated, extracted, and the store ends as the golden says', async () => {
        const text = await golden('full');
        assert.ok(text.includes('=== enumeration input 6'), 'every turn is enumerated');
        assert.ok(text.includes('=== writer input 6'), 'every turn is extracted');
        matches('engine-golden-full.txt', text);
    });

    test('the writer reconciles one candidate per turn into one fact per turn', async () => {
        const { done, seen, documents } = await replayRun('full', FULL_WRITER_VIEW);
        assert.equal(documents.length, 6);
        assert.ok(seen.every((request) => request.input.candidates?.length === 1));
        assert.deepEqual(done.facts.map((fact) => fact.text), NUMBERS.map((name) => `Candidate number ${name}`));
    });
});

describe('a long or thin turn gets one second look', () => {
    let dir = '';
    const file = (name: string, turns: Parameters<typeof transcriptOf>[0]): string => {
        const path = join(dir, name);
        writeFileSync(path, transcriptOf(turns));
        return path;
    };

    before(() => {
        dir = mkdtempSync(join(tmpdir(), 'tab-recap-e2e-23-'));
    });

    after(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    test('a turn read in several chunks takes one ask-back with the questions the candidates leave open, after the chunks', async () => {
        const path = file('long.jsonl', [{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]);
        const { seen, documents } = await replayPath(path, 'full', [(document, call): string => (document.includes('<questions>') ? answer([{ section: 'rules', text: 'Never push to main', anchor: quote(document) }]) : answer([{ section: 'done', text: `Reworked part ${call}`, anchor: quote(document) }]))]);
        const questions = asked(documents);
        assert.equal(questions.length, 1);
        assert.equal(documents.at(-1), questions[0]);
        assert.ok(documents.length >= 3, 'two chunks, then the ask-back');
        for (const question of QUESTIONS) {
            assert.ok(questions[0]?.includes(`>${question}</question>`), question);
        }
        assert.ok(seen.at(-1)?.input.candidates?.some((one) => one.section === 'rules'), 'the answer of the ask-back reaches the writer');
    });

    test('a long turn is cut into chunks of at most 6 000 characters that hold every row once, in order, and are filled', async () => {
        const path = file('chunks.jsonl', [{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]);
        const { documents } = await replayPath(path, 'enumerate', [answer([])]);
        const chunks = chunksIn(documents);
        assert.ok(chunks.length >= 2, `${chunks.length} chunks`);
        assert.ok(chunks.every((chunk) => chunk.length <= 6_000), chunks.map((chunk) => chunk.length).join(' '));
        assert.ok(chunks.slice(0, -1).every((chunk) => chunk.length > 2_000), 'chunks are filled, not cut short');
        const rows = chunks.flatMap((chunk) => [...chunk.matchAll(/Step (\d+):/g)].map((found) => Number(found[1])));
        assert.deepEqual(rows, Array.from({ length: 60 }, (_, at) => at));
    });

    test('a split falls between turns when it can: every later chunk starts at a prompt of the operator', async () => {
        const turns = Array.from({ length: 12 }, (_, at) => ({ prompt: `prompt ${at}`, said: ['reply word '.repeat(150)] }));
        const path = file('turns.jsonl', turns);
        const { done, documents } = await replayPath(path, 'enumerate', [answer([])], 12);
        assert.deepEqual([done.windows, done.turns], [1, 12], 'the 12 turns share one enumeration');
        const chunks = chunksIn(documents);
        assert.ok(chunks.length > 2, `${chunks.length} chunks`);
        for (const chunk of chunks.slice(1)) {
            assert.match(chunk.trimStart(), /^<turn role="user"/);
        }
    });

    test('a long turn of tool calls: reads are counted and never listed, a call is clipped to 400 characters', async () => {
        const calls = Array.from({ length: 30 }, (_, at) => [{ name: 'Read', input: { file_path: `/work/src/read-${at}.ts` } }, { name: 'Edit', input: { file_path: `/work/${'x'.repeat(900)}${at}.ts` } }]).flat();
        const path = file('tools.jsonl', [{ prompt: 'Do it all', said: ['Starting.'], calls }]);
        const { documents } = await replayPath(path, 'enumerate', [answer([])]);
        const chunks = chunksIn(documents).join('');
        const reads = [...chunks.matchAll(/<tools reads="(\d+)"/g)].reduce((all, found) => all + Number(found[1]), 0);
        assert.equal(reads, 30);
        assert.ok(!chunks.includes('read-0.ts'), 'a read is not listed');
        const bodies = [...chunks.matchAll(/<call [^>]*>([^<]*)<\/call>/g)].map((found) => found[1] ?? '');
        assert.equal(bodies.length, 30);
        assert.ok(bodies.every((body) => body.length === 400), bodies.map((body) => body.length).join(' '));
    });

    test('a long turn whose chunks yield plenty of candidates still gets its second look', async () => {
        const path = file('plenty.jsonl', [{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]);
        const { documents } = await replayPath(path, 'full', [plenty]);
        assert.equal(asked(documents).length, 1);
        assert.equal(documents.at(-1), asked(documents)[0]);
    });

    test('a question the first candidates already answer is not asked again', async () => {
        const path = file('answered.jsonl', [{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]);
        const { documents } = await replayPath(path, 'full', [(document, call): string => answer([{ section: 'goal', text: 'Move the importer to async streams', anchor: quote(document) }, { section: 'rules', text: `Never push to main ${call}`, anchor: quote(document) }])]);
        const questions = asked(documents)[0] ?? '';
        assert.ok(!questions.includes('>What is the goal?</question>'));
        assert.ok(!questions.includes('>What must not be done?</question>'));
        assert.ok(questions.includes('>What is the next action?</question>'));
    });

    test('an open fact the turn speaks of, that no candidate carries, is asked about by name', async () => {
        const path = file('open.jsonl', [{ prompt: 'Fix the migration test', said: [`${OPEN_FACT}.`] }, { prompt: 'Move the importer to async streams', said: [`${OPEN_FACT}, still.`, ...stepsOf(60)] }]);
        const { documents } = await replayPath(path, 'full', [(document, call): string => (call === 1 ? answer([{ section: 'next', text: OPEN_FACT, anchor: quote(document) }]) : answer([]))]);
        assert.ok(asked(documents).some((document) => document.includes(`>What changed about the open fact "${OPEN_FACT}"?</question>`)), 'asked');
    });

    test('the enumerate pipeline takes no ask-back on the same long turn', async () => {
        const path = file('enumerate.jsonl', [{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]);
        const { documents } = await replayPath(path, 'enumerate', [answer([])]);
        assert.equal(asked(documents).length, 0);
        assert.ok(documents.length >= 2);
    });

    test('a short turn that yields enough candidates takes none either', async () => {
        const rich = answer([{ section: 'goal', text: 'Add retries', anchor: 'Add retries to the uploader' }, { section: 'done', text: 'Added retry with backoff', anchor: 'Added a retry' }, { section: 'next', text: 'Tag it', anchor: 'Tag it' }, { section: 'rules', text: 'Never push to main', anchor: 'Add retries to the uploader' }, { section: 'needs', text: 'Which branch', anchor: 'Add retries' }, { section: 'decisions', text: 'Backoff because gentler', why: 'gentler', anchor: 'retry with backoff' }]);
        const path = file('short.jsonl', [{ prompt: 'Add retries to the uploader', said: ['Added a retry with backoff in src/upload.ts.'] }]);
        const { documents } = await replayPath(path, 'full', [rich]);
        assert.equal(documents.length, 1);
    });
});

describe('the second look and the judge ask the same six questions', () => {
    test('the judge\'s read-back lists, in order, the questions the ask-back puts to the enumeration', { timeout: 30_000 }, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tab-recap-e2e-23-'));
        const world = judgingWorld();
        try {
            const path = join(dir, 'long.jsonl');
            writeFileSync(path, transcriptOf([{ prompt: 'Move the importer to async streams', said: stepsOf(60) }]));
            const { documents } = await replayPath(path, 'full', [answer([])]);
            const put = [...(asked(documents)[0] ?? '').matchAll(/<question id="q\d+">([^<]+)<\/question>/g)].map((found) => found[1] ?? '');
            assert.equal(put.length, 6);
            world.seed(1);
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 0, ran.stderr);
            const told = world.seen('readback');
            put.forEach((question, at) => { assert.ok(told.includes(`${at + 1}. ${question}`), question); });
        } finally {
            world.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('the pipeline and the enumerator come from the settings', () => {
    let world: EvalWorld;
    let settings: BackendsWorld;

    before(() => {
        world = judgingWorld();
        settings = backendsWorld();
    });

    after(() => {
        world.close();
        settings.close();
    });

    const named = async (config: string): Promise<string> => {
        world.write('config/config.env', config);
        world.forget();
        for (let call = 1; call <= 6; call += 1) {
            world.answer(`writer.${call}`, JSON.stringify({ ops: [] }));
        }
        const ran = await world.run(['eval', '--replay', FILE]);
        assert.equal(ran.code, 0, ran.stderr);
        return /pipeline (\S+) ·/.exec(ran.stdout)?.[1] ?? '';
    };

    test('TAB_RECAP_PIPELINE names the steps of a run: one unless set, nonsense is the default', { timeout: 60_000 }, async () => {
        assert.equal(await named(''), 'one');
        assert.equal(await named('TAB_RECAP_PIPELINE=Enumerate+Gates\n'), 'enumerate+gates');
        assert.equal(await named('TAB_RECAP_PIPELINE=fast\n'), 'one');
    });

    test('TAB_RECAP_RECONCILE_EVERY is the turns between two reconciliations: 8, or a whole number of 1 or more', () => {
        assert.equal(reconcileEvery(settings), 8);
        assert.equal(reconcileEvery(settings, 'TAB_RECAP_RECONCILE_EVERY=3'), 3);
        assert.equal(reconcileEvery(settings, 'TAB_RECAP_RECONCILE_EVERY=2.7'), 2);
        assert.equal(reconcileEvery(settings, 'TAB_RECAP_RECONCILE_EVERY=0'), 8);
        assert.equal(reconcileEvery(settings, 'TAB_RECAP_RECONCILE_EVERY=soon'), 8);
    });

    test('the enumeration runs on the writer\'s harness, at low effort, under the writer\'s model', async () => {
        settings.write('TAB_RECAP_BACKEND=claude\nTAB_RECAP_MODEL_CLAUDE=sonnet\nTAB_RECAP_EFFORT=high\n');
        settings.offer('claude', 'codex');
        await settings.backends.refresh();
        assert.equal(settings.backends.enumerator()?.job, 'claude · sonnet · low');
    });

    test('there is none when no harness is installed or the writer is a custom command', async () => {
        settings.write('TAB_RECAP_BACKEND=auto\n');
        settings.offer();
        await settings.backends.refresh();
        assert.equal(settings.backends.enumerator(), null);
        settings.write('TAB_RECAP_BACKEND=custom\nTAB_RECAP_CUSTOM_CMD=cat\n');
        settings.offer('custom');
        await settings.backends.refresh();
        assert.equal(settings.backends.enumerator(), null);
    });
});
