import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { databaseFile } from '#src/adapters/db/database.ts';
import type { Directory } from '@stateforge-labs/session-ledger';
import { judgingWorld, type EvalWorld } from '../support/eval-world.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const CLAUDE_FILE = join(PLUGIN, 'test', 'fixtures', 'replay-claude.jsonl');
const BIN = (name: string): string => join(PLUGIN, 'bin', name);
const DAY = 86_400_000;

const WRITES = ['Wrote the cart model', 'Chose SQLite for carts', 'Added totals', 'Opened merge request 34', 'Asked about guest baskets', 'Settled on a cookie'];
const ANCHORS = ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals', 'open a merge request', 'can guests keep their basket?', 'cookie is fine'];

function writing(world: EvalWorld, texts: readonly string[], anchors: readonly string[]): void {
    texts.forEach((text, at) => { world.answer(`writer.${at + 1}`, JSON.stringify({ ops: [{ op: 'add', anchor: anchors[at], section: 'done', text }] })); });
}

const codexMessage = (role: string, at: string, text: string): string => JSON.stringify({ timestamp: at, type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } });
const CODEX = [codexMessage('user', '2026-10-07T09:00:00.000Z', 'Add a cart to the shop'), codexMessage('assistant', '2026-10-07T09:01:00.000Z', 'I will start with the cart model.'), codexMessage('user', '2026-10-07T09:05:00.000Z', 'also add totals'), codexMessage('assistant', '2026-10-07T09:06:00.000Z', 'Added totals in src/totals.ts.')].join('\n') + '\n';

const tool = (path: string): string => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: path } }] } });
const user = (text: string): string => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, timestamp: '2026-10-07T16:37:50.000Z' });
const boundary = JSON.stringify(JSON.parse(readFileSync(join(PLUGIN, 'test', 'fixtures', 'claude-compact-boundary.jsonl'), 'utf8').split('\n')[1] ?? ''));
const session = `${[user('please fix the login bug in auth'), tool('/a.ts'), tool('/b.ts'), tool('/c.ts'), boundary, user('fix the login bug in auth please'), tool('/b.ts'), tool('/zzz.ts')].join('\n')}\n`;


const SAFE = { closes_request: 1, announces_continuation: 0, asks_detailed_choice: 0, needs_verbatim: 0, changes_subject: 0, stuck: 0 };
const UNSAFE = { ...SAFE, needs_verbatim: 1 };
const KEYS = ['a', 'b', 'c', 'd'];
const LABELS: Readonly<Record<string, typeof SAFE>> = { a: SAFE, b: UNSAFE, c: SAFE, d: UNSAFE };
const answer = (closes: number, others: number): Record<string, number> => ({ closes_request: closes, announces_continuation: others, asks_detailed_choice: others, needs_verbatim: others, changes_subject: others, stuck: others });
const rows = (compact: readonly string[], closes: number, others: number, rest: readonly [number, number] = [0.2, 0.1]): string => `${KEYS.map((key) => JSON.stringify({ key, kind: 'point', answers: compact.includes(key) ? answer(closes, others) : answer(rest[0], rest[1]), tokens: 10, costUsd: 0.01, tookMs: 100 })).join('\n')}\n`;

function folder(world: EvalWorld, name: string, arms: Readonly<Record<string, readonly [string, string]>>): string {
    const dir = join(world.root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'corpus.jsonl'), '');
    writeFileSync(join(dir, 'labels.jsonl'), `${KEYS.map((id) => JSON.stringify({ id, labels: LABELS[id] })).join('\n')}\n`);
    for (const [arm, [first, second]] of Object.entries(arms)) {
        writeFileSync(join(dir, `answers-${arm}-1.jsonl`), first);
        writeFileSync(join(dir, `answers-${arm}-2.jsonl`), second);
    }
    return dir;
}

describe('eval --replay reads a transcript and prints the report', () => {
    let world: EvalWorld;
    let full = { code: 0 as number | null, stdout: '', stderr: '' };

    before(async () => {
        world = judgingWorld();
        writing(world, WRITES, ANCHORS);
        full = await world.run(['eval', '--replay', CLAUDE_FILE, '--pipeline', 'one']);
    });

    after(() => {
        world.close();
    });

    test('the report names the view, the pipeline, the jobs and the cost, one writer call per turn', () => {
        assert.equal(full.code, 0, full.stderr);
        assert.match(full.stdout, /^view full · pipeline one · merge-turns 1 · writer custom\/fake-judge\.sh medium · enumeration none · judge custom · default · medium · cost: \$0\.000 over 6 turns .* calls: 6 writer \+ 0 enumeration \(1\.00 per turn\)/);
        assert.match(full.stdout, /replay of .*replay-claude\.jsonl: 6 turns: 6 facts, 6 open, 0 closed/);
    });

    test('the ledger after the replay lists the facts the writer made', () => {
        for (const text of WRITES) {
            assert.match(full.stdout, new RegExp(`done +open +\\d\\d:\\d\\d–\\d\\d:\\d\\d +${text}`));
        }
        assert.match(full.stdout, /facts with an anchor found in the input: 6 of 6 \(100%\)/);
    });

    test('the judge reports over the replayed runs, none of them stored in the real store', () => {
        assert.match(full.stdout, /the judge over the replay \(6 runs\):/);
        assert.match(full.stdout, /6 runs sampled, 6 judged/);
        assert.equal(Number(world.sql('SELECT COUNT(*) AS n FROM run')[0]?.['n']), 0);
        assert.equal(Number(world.sql('SELECT COUNT(*) AS n FROM verdict')[0]?.['n']), 0);
    });

    test('--prune names the pruned view in the report line', { timeout: 30_000 }, async () => {
        const ran = await world.run(['eval', '--replay', CLAUDE_FILE, '--pipeline', 'one', '--prune']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /^view pruned ·/);
    });

    test('a path under .codex picks the codex reader, a path elsewhere the claude reader', { timeout: 30_000 }, async () => {
        const codex = world.write('home/.codex/sessions/rollout-a.jsonl', CODEX);
        world.forget();
        writing(world, ['Wrote the cart model', 'Added totals'], ['Add a cart to the shop', 'also add totals']);
        const ran = await world.run(['eval', '--replay', codex, '--pipeline', 'one']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /rollout-a\.jsonl: 2 turns: 2 facts/);
        const claude = await world.run(['eval', '--replay', world.write('elsewhere/a.jsonl', CODEX), '--pipeline', 'one']);
        assert.match(claude.stdout, /a\.jsonl: 0 turns/);
    });

    test('--kind overrides the path', { timeout: 30_000 }, async () => {
        world.forget();
        const ran = await world.run(['eval', '--replay', world.write('elsewhere/b.jsonl', CODEX), '--kind', 'codex', '--pipeline', 'one']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /b\.jsonl: 2 turns: 2 facts/);
    });

    test('a --kind that names no replay reader exits 2, and a file that cannot be read exits 3', { timeout: 30_000 }, async () => {
        for (const kind of ['zed', 'constructor', 'opencode']) {
            const ran = await world.run(['eval', '--replay', CLAUDE_FILE, '--kind', kind]);
            assert.equal(ran.code, 2, kind);
            assert.match(ran.stderr, /--kind takes claude or codex/);
        }
        const missing = await world.run(['eval', '--replay', join(world.root, 'absent.jsonl')]);
        assert.equal(missing.code, 3);
        assert.match(missing.stderr, /cannot read .*absent\.jsonl/);
    });
});

describe('eval --replay --compare-imported scores the 1.x recaps against the replay', () => {
    let world: EvalWorld;
    let ran = { code: 0 as number | null, stdout: '', stderr: '' };

    before(async () => {
        world = judgingWorld();
        writing(world, WRITES, ANCHORS);
        world.answer('cover', JSON.stringify({ keyfacts: ['a cart exists', 'totals exist', 'a rollback plan'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }, { keyfact: 1, item: 'state/t1/done/1' }, { keyfact: 2, item: null }] }));
        world.importChapters('w1:t1', [
            { at: Date.parse('2026-10-07T09:12:00Z'), texts: ['Cart model written'] },
            { at: Date.parse('2026-10-07T09:27:00Z'), texts: ['Totals added', 'Tests pass', 'Docs written'] },
            { at: Date.parse('2026-10-20T09:00:00Z'), texts: ['Later work'] },
        ]);
        ran = await world.run(['eval', '--replay', CLAUDE_FILE, '--pipeline', 'one', '--compare-imported', 'w1:t1']);
    });

    after(() => {
        world.close();
    });

    test('the report has one row per chapter with the 1.x numbers beside the replay\'s', () => {
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /the last good 1\.x recap of each chapter of w1:t1 against the replay's ledger state at the same time/);
        assert.match(ran.stdout, /coverage 1\.x +coverage 2\.x +no-filler 1\.x +no-filler 2\.x +read-back 1\.x +read-back 2\.x/);
        assert.match(ran.stdout, /chapter 1 \(2026-10-07 09:12, 3 key facts\) +33% \(1\/3\) +67% \(2\/3\) +100% \(1\/1\) +67% \(2\/3\) +6\/6 +6\/6/);
        assert.match(ran.stdout, /chapter 2 \(2026-10-07 09:27, 3 key facts\) +67% \(2\/3\) +67% \(2\/3\) +67% \(2\/3\) +33% \(2\/6\) +6\/6 +6\/6/);
    });

    test('the sums add the chapters up, and read-back is graded on each side', () => {
        assert.match(ran.stdout, /all chapters +50% \(3\/6\) +67% \(4\/6\) +75% \(3\/4\) +44% \(4\/9\) +12\/12 +12\/12/);
    });

    test('a chapter after the end of the replay is skipped and says why', () => {
        assert.match(ran.stdout, /chapter 3 \(2026-10-20 09:00\): the replay does not reach this chapter/);
    });

    test('when the replay reaches no chapter the report says no chapter could be compared', { timeout: 30_000 }, async () => {
        world.forget();
        writing(world, WRITES, ANCHORS);
        world.importChapters('w1:t9', [{ at: Date.parse('2026-10-20T09:00:00Z'), texts: ['Later work'] }]);
        const later = await world.run(['eval', '--replay', CLAUDE_FILE, '--pipeline', 'one', '--compare-imported', 'w1:t9']);
        assert.equal(later.code, 0, later.stderr);
        assert.match(later.stdout, /no chapter could be compared/);
    });

    test('the key facts the replay side found go to the 1.x side, and both read the same chapter\'s turns', () => {
        const [replaySide, importedSide] = [world.seen('cover', 1), world.seen('cover', 2)];
        assert.ok(!replaySide.includes('<keyfact>'));
        assert.ok(importedSide.includes('<keyfact>a cart exists</keyfact>') && importedSide.includes('<keyfact>totals exist</keyfact>'));
        assert.ok(replaySide.includes('Add a cart to the shop') && replaySide.includes('also add totals') && !replaySide.includes('open a merge request'));
        const second = world.seen('cover', 3);
        assert.ok(second.includes('open a merge request') && !second.includes('Add a cart to the shop'), 'chapter 2 starts after chapter 1');
        assert.ok(![replaySide, importedSide, second].some((document) => document.includes('<ledger')), 'turns, not the ledgers the writer saw');
    });
});

describe('the experiment commands write their files in the folder they are given', () => {
    let world: EvalWorld;
    let out = '';
    let ran = { code: 0 as number | null, stdout: '', stderr: '' };

    const read = (name: string): string => readFileSync(join(out, name), 'utf8');
    before(async () => {
        world = judgingWorld();
        world.write('home/.claude/projects/p/recent.jsonl', session);
        const old = world.write('home/.claude/projects/p/old.jsonl', session);
        const longAgo = (Date.now() - 40 * DAY) / 1000;
        utimesSync(old, longAgo, longAgo);
        world.write('home/.claude/projects/p/subagents/sub.jsonl', session);
        world.write('home/.claude/projects/p/plain.jsonl', `${user('hello')}\n`);
        mkdirSync(join(world.root, 'copy'));
        copyFileSync(databaseFile(world.state as Directory), join(world.root, 'copy', 'exp.db'));
        out = join(world.root, 'out');
        ran = await world.run(['--db', join(world.root, 'copy', 'exp.db'), '--out', out], { script: BIN('autocompact-corpus.ts') });
    });

    after(() => {
        world.close();
    });

    test('the corpus command refuses the plugin\'s live store and asks for a copy', { timeout: 30_000 }, async () => {
        const refused = await world.run(['--db', databaseFile(world.state as Directory), '--out', join(world.root, 'refused')], { script: BIN('autocompact-corpus.ts') });
        assert.equal(refused.code, 1);
        assert.match(refused.stderr, /refusing to open the plugin's live store .* give a copy of it with --db/);
        assert.deepEqual(existsSync(join(world.root, 'refused')) ? readdirSync(join(world.root, 'refused')) : [], []);
    });

    test('a corpus run writes its four files in the folder and nothing else', () => {
        assert.equal(ran.code, 0, ran.stderr);
        assert.deepEqual(readdirSync(out).toSorted(), ['corpus.jsonl', 'manifest.json', 'outcome-points.jsonl', 'outcomes.jsonl']);
        assert.deepEqual(readdirSync(world.root).toSorted(), ['answers', 'bin', 'config', 'copy', 'home', 'out', 'refused', 'state']);
        assert.deepEqual(readdirSync(world.home).toSorted(), ['.claude']);
        assert.deepEqual(JSON.parse(ran.stdout), JSON.parse(read('manifest.json')));
    });

    test('the manifest names the seed, the counts and the sha-256 of the database and of each file', () => {
        const manifest = JSON.parse(read('manifest.json')) as { seed: number; boundaries: number; corpus: number; db: { file: string; sha256: string }; files: Record<string, string> };
        assert.equal(manifest.seed, 42);
        assert.equal(manifest.corpus, 0);
        assert.equal(manifest.db.sha256, createHash('sha256').update(readFileSync(join(world.root, 'copy', 'exp.db'))).digest('hex'));
        assert.deepEqual(Object.keys(manifest.files), ['corpus.jsonl', 'outcomes.jsonl', 'outcome-points.jsonl']);
        for (const [name, digest] of Object.entries(manifest.files)) {
            assert.equal(digest, createHash('sha256').update(readFileSync(join(out, name))).digest('hex'), name);
        }
    });

    test('only the recent transcripts that hold a compaction count, never a subagent\'s, and each boundary says what was re-read and restated', () => {
        const boundaries = read('outcomes.jsonl').trim().split('\n').map((line) => JSON.parse(line) as { source: string; trigger: string; reReads: number; restated: boolean; followed: boolean; point_id: string | null });
        assert.equal(boundaries.length, 1);
        assert.equal(JSON.parse(read('manifest.json')).boundaries, 1);
        assert.deepEqual(boundaries.map((row) => [row.source, row.trigger, row.reReads, row.restated, row.followed, row.point_id]), [[join(world.home, '.claude', 'projects', 'p', 'recent.jsonl'), 'manual', 1, true, true, null]]);
    });

    test('the same inputs give the same files', { timeout: 30_000 }, async () => {
        const again = join(world.root, 'again');
        const second = await world.run(['--db', join(world.root, 'copy', 'exp.db'), '--out', again], { script: BIN('autocompact-corpus.ts') });
        assert.equal(second.code, 0, second.stderr);
        for (const name of ['corpus.jsonl', 'outcome-points.jsonl']) {
            assert.equal(readFileSync(join(again, name), 'utf8'), read(name), name);
        }
        assert.equal(readFileSync(join(again, 'outcomes.jsonl'), 'utf8').replaceAll(/"mtime":[\d.]+,/g, ''), read('outcomes.jsonl').replaceAll(/"mtime":[\d.]+,/g, ''));
    });

    test('a corpus run without its options says which one is missing', { timeout: 30_000 }, async () => {
        const missing = await world.run(['--out', join(world.root, 'nowhere')], { script: BIN('autocompact-corpus.ts') });
        assert.equal(missing.code, 1);
        assert.match(missing.stderr, /usage: autocompact-corpus\.ts --db <file> --out <dir> \(missing --db\)/);
    });

    test('the probe without a valid arm and repetition prints its usage and exits 2', { timeout: 30_000 }, async () => {
        for (const args of [[], ['--dir', out], ['--dir', out, '--arm', 'gpt', '--rep', '1'], ['--dir', out, '--arm', 'jev', '--rep', '3']]) {
            const probe = await world.run(args, { script: BIN('autocompact-probe.ts') });
            assert.equal(probe.code, 2, args.join(' '));
            assert.match(probe.stderr, /usage: autocompact-probe\.ts --dir <exp002 dir> --arm jev\|haiku-low\|haiku-medium\|luna-low --rep 1\|2/);
        }
        assert.deepEqual(readdirSync(out).toSorted(), ['corpus.jsonl', 'manifest.json', 'outcome-points.jsonl', 'outcomes.jsonl']);
    });
});

describe('the report command scores the arms and picks the default', () => {
    const steady = rows(['a', 'c'], 0.9, 0.1);
    const wandering = rows(['a', 'c'], 0.95, 0.02, [0.2, 0.02]);
    const wanderingToo = rows(['a', 'c'], 0.7, 0.3, [0.45, 0.3]);

    test('it writes report.md in the folder, prints the same text, and names precision and recall per policy', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const dir = folder(world, 'one', { jev: [rows(['a', 'b'], 0.9, 0.1), rows(['a', 'b'], 0.9, 0.1)] });
            const ran = await world.run(['--dir', dir], { script: BIN('autocompact-report.ts') });
            assert.equal(ran.code, 0, ran.stderr);
            assert.equal(ran.stdout, readFileSync(join(dir, 'report.md'), 'utf8'));
            assert.match(ran.stdout, /0 points, 4 labelled, 0 at or above the minimum; .* labelled safe \(verdict compact\): 2\./);
            assert.match(ran.stdout, /\| jev \| 0\.500 \| 0\.500 \| 2 \|/);
            assert.deepEqual(readdirSync(dir).toSorted(), ['answers-jev-1.jsonl', 'answers-jev-2.jsonl', 'corpus.jsonl', 'labels.jsonl', 'report.md']);
        } finally {
            world.close();
        }
    });

    test('a brief answer becomes one row per fact and coverage AUC reads the brief labels', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const dir = folder(world, 'briefs', {});
            const brief = `${JSON.stringify({ key: 'p', kind: 'brief', answers: { keeps_0: 0.9, keeps_1: 0.2, reason_1: 0.6 }, tokens: 100, costUsd: 0.5, tookMs: 700 })}\n`;
            writeFileSync(join(dir, 'answers-jev-1.jsonl'), brief);
            writeFileSync(join(dir, 'answers-jev-2.jsonl'), brief);
            writeFileSync(join(dir, 'briefs.jsonl'), `${JSON.stringify({ id: 'p', labels: { 0: { keeps: 1 }, 1: { keeps: 0, reason: 1 } } })}\n`);
            const ran = await world.run(['--dir', dir], { script: BIN('autocompact-report.ts') });
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /\| jev \| brief_keeps_fact \| 2 \| 1 \| 1 \|/);
        } finally {
            world.close();
        }
    });

    test('a recap-writer harness within 3 points of the best with low drift wins', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const dir = folder(world, 'two', { jev: [steady, steady], 'haiku-low': [steady, steady] });
            const ran = await world.run(['--dir', dir], { script: BIN('autocompact-report.ts') });
            assert.match(ran.stdout, /Default decider: \*\*haiku-low\*\*/);
            assert.match(ran.stdout, /haiku-low: a recap-writer harness within 3 points of the best precision/);
        } finally {
            world.close();
        }
    });

    test('with no harness steady, the most precise steady arm; with none steady, no default', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const jev = folder(world, 'three', { jev: [steady, steady], 'haiku-low': [wandering, wanderingToo] });
            assert.match((await world.run(['--dir', jev], { script: BIN('autocompact-report.ts') })).stdout, /Default decider: \*\*jev\*\*/);
            const none = folder(world, 'four', { jev: [wandering, wanderingToo], 'haiku-low': [wandering, wanderingToo] });
            assert.match((await world.run(['--dir', none], { script: BIN('autocompact-report.ts') })).stdout, /Default decider: \*\*none \(stay on `recap`\)\*\*/);
        } finally {
            world.close();
        }
    });

    test('operator labels gate a question by kappa: usable at 0.6 and enough points', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const dir = folder(world, 'kappa', {});
            const ids = Array.from({ length: 12 }, (_, at) => `p${at}`);
            const lines = (label: (at: number) => Record<string, number>): string => `${ids.map((id, at) => JSON.stringify({ id, labels: label(at) })).join('\n')}\n`;
            writeFileSync(join(dir, 'labels.jsonl'), lines((at) => ({ closes_request: at % 2 === 0 ? 0 : 1, needs_verbatim: at % 3 === 0 ? 1 : 0 })));
            writeFileSync(join(dir, 'operator-labels.jsonl'), lines((at) => ({ closes_request: at % 2 === 0 ? 0 : 1, needs_verbatim: at % 2 === 0 ? 0 : 1 })));
            const ran = await world.run(['--dir', dir], { script: BIN('autocompact-report.ts') });
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /\| closes_request \| 12 \| 1 \| yes \|/);
            assert.match(ran.stdout, /\| needs_verbatim \| 12 \| [^|]+ \| no \|/);
            assert.match(ran.stdout, /\| stuck \| 0 \| [^|]+ \| no \|/);
        } finally {
            world.close();
        }
    });

    test('without --dir it prints its usage and exits 2', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            const ran = await world.run([], { script: BIN('autocompact-report.ts') });
            assert.equal(ran.code, 2);
            assert.match(ran.stderr, /usage: autocompact-report\.ts --dir <exp002 dir>/);
        } finally {
            world.close();
        }
    });
});
