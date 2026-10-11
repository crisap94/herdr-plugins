import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { connect } from '#src/adapters/db/connection.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { factsOfTab } from '#src/adapters/db/imported.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { styleFor } from '#src/adapters/terminal-style.ts';
import type { Judge, JudgeTask } from '#src/ports/judge.ts';
import { judgedReport } from '#src/recap/application/replay-judge.ts';
import { replay, windowsOf } from '#src/recap/application/replay.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { checksOf, ledgerText, reportOf } from '#src/recap/application/replay-report.ts';
import { scratchDir } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import { factOf } from './fakes/facts.ts';

const FILE = join(import.meta.dirname, 'fixtures', 'replay-claude.jsonl');
const add = (section: string, text: string, why?: string): Record<string, unknown> => ({ op: 'add', section, text, ...(why === undefined ? {} : { why }) });
const QUOTES = ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals', 'open a merge request', 'can guests keep their basket?', 'cookie is fine'];

function scripted(answers: readonly (readonly Record<string, unknown>[])[]): { summarizer: Summarizer; shown: string[] } {
    const shown: string[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            shown.push(request.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => fact.text)).join('|'));
            const given = answers[Math.min(shown.length - 1, answers.length - 1)] ?? [];
            const quoted = given.map((each) => (each['op'] === 'add' && each['anchor'] === undefined ? Object.assign({}, each, { anchor: QUOTES[shown.length - 1] }) : each));
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: quoted }), costUsd: 0 });
        },
    };
    return { summarizer, shown };
}

const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

test('windows: one turn each — a prompt and everything up to the next prompt; a queued prompt belongs to the turn it was typed in', () => {
    const entries = [{ role: 'agent' as const, text: 'hello' }, { role: 'user' as const, text: 'a' }, { role: 'tool' as const, text: 'ls' }, { role: 'user' as const, text: 'q', queued: true }, { role: 'user' as const, text: 'b' }, { role: 'agent' as const, text: 'ok' }];
    assert.deepEqual(windowsOf(entries).map((window) => window.map((entry) => entry.text)), [['hello', 'a', 'ls', 'q'], ['b', 'ok']]);
    assert.deepEqual(windowsOf([]), []);
});

test('merging turns groups whole turns in order and drops nothing', () => {
    const entries = [{ role: 'user' as const, text: 'a' }, { role: 'agent' as const, text: 'x' }, { role: 'user' as const, text: 'b' }, { role: 'user' as const, text: 'c' }, { role: 'agent' as const, text: 'y' }, { role: 'user' as const, text: 'd' }, { role: 'user' as const, text: 'e' }];
    assert.equal(windowsOf(entries).length, 5);
    assert.deepEqual(windowsOf(entries, 1).map((window) => window.map((entry) => entry.text)), [['a', 'x'], ['b'], ['c', 'y'], ['d'], ['e']]);
    assert.deepEqual(windowsOf(entries, 2).map((window) => window.map((entry) => entry.text)), [['a', 'x', 'b'], ['c', 'y', 'd'], ['e']]);
    assert.deepEqual(windowsOf(entries, 2).flat(), entries);
});

test('a 6-turn transcript: 6 extractor runs on the scratch ledger, each shown what the earlier ones added; the live database is not touched', async () => {
    const live = scratchDir('replay-live');
    try {
        const path = join(live, 'tab-recap.db');
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        opened.db.close();
        const before = hash(path);
        const { summarizer, shown } = scripted([[add('goal', 'Add a cart to the shop')], [add('decisions', 'Store carts in SQLite', 'no server needed')], [add('done', 'Added cart totals')], [add('done', 'Opened !34 for feat/cart')], [add('needs', 'Should guests keep their basket?')], [{ op: 'close', id: 'f5', why: 'answered' }, add('done', 'Guests keep their basket in a cookie')]]);
        const scratch = scratchStore();
        try {
            const done = await replay({ reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, repos: NO_REPOS, language: 'en', log: () => undefined, writerView: FULL_WRITER_VIEW }, FILE, 'replay:t1', statSync(FILE).size);
            assert.equal(done.windows, 6);
            assert.equal(shown.length, 6, 'six extractor runs');
            assert.deepEqual(shown.map((each) => each.split('|').filter((line) => line !== '').length), [0, 1, 2, 3, 4, 5], 'each run is shown the facts the earlier ones added');
            assert.deepEqual(done.facts.map((fact) => [fact.section, fact.state, fact.closedWhy]), [['goal', 'open', null], ['decisions', 'open', null], ['done', 'open', null], ['done', 'open', null], ['needs', 'closed', 'answered'], ['done', 'open', null]]);
            assert.ok(done.facts.every((fact) => fact.firstAt >= Date.parse('2026-10-07T09:00:00Z')), 'facts carry the times of the transcript, not the time of the replay');
            const report = reportOf('replay', done.facts);
            assert.match(report, /^replay: 6 facts, 5 open, 1 closed/);
            assert.match(report, /decisions carry a why +100%/);
            assert.match(ledgerText(done.facts, 'UTC'), /needs +answered +09:\d\d–09:\d\d +Should guests keep their basket\?/);
        } finally {
            scratch.dispose();
        }
        assert.equal(hash(path), before, 'the live database file is byte for byte the same');
        assert.equal(factsOfTab(path, 'replay:t1')?.length, 0, 'and holds nothing of the replay');
    } finally {
        rmSync(live, { recursive: true, force: true });
    }
});

test('imported facts of a tab are read beside the replay, read-only; no database, or one without a ledger, is none', () => {
    const dir = scratchDir('replay-imported');
    try {
        assert.equal(factsOfTab(join(dir, 'missing.db'), 'w1:t1'), null);
        const path = join(dir, 'tab-recap.db');
        const db = connect(path);
        db.exec('CREATE TABLE task (id BLOB)');
        db.close();
        assert.equal(factsOfTab(path, 'w1:t1'), null, 'a database from before the ledger');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('checks: short lines, decisions with a why (the "(not recorded)" gap does not count), no open repeats within a task and section', () => {
    const facts = [
        factOf('decisions', 'Keep SQLite', { why: 'one file' }), factOf('decisions', 'Skip auth', { why: '(not recorded)' }),
        factOf('done', 'Wrote the release notes today'), factOf('done', 'Wrote the release notes today again'), factOf('done', Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ')),
    ];
    const byName = Object.fromEntries(checksOf(facts).map((check) => [check.name, [check.passed, check.of]]));
    assert.deepEqual(byName, { 'short (≤ 16 words)': [4, 5], 'decisions carry a why': [1, 2], 'no open repeats': [4, 5] });
    assert.match(reportOf('x', []), /^x: 0 facts, 0 open, 0 closed/);
});

test('the store a replay writes to is a real store: the same repositories, the full schema', () => {
    const scratch = scratchStore();
    try {
        assert.equal(scratch.store.kind, 'ready');
        assert.ok(storeOver(scratch.store.db).ledger.openOf({ tab: 'x', key: 't1' }).length === 0);
    } finally {
        scratch.dispose();
    }
});

const lenient: Judge = {
    label: 'fake · judge · low',
    ask: (task, document) => {
        const keys = [...document.matchAll(/<item key="([^"]+)" section="([^"]+)"/g)].map((found) => ({ key: found[1] ?? '', section: found[2] ?? '' }));
        const answers: Record<JudgeTask, unknown> = {
            score: { verdicts: keys.flatMap(({ key, section }) => ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', `S-${section}`].map((check) => ({ item: key, check, pass: true, critique: '' }))), keyfacts: ['the cart'], coverage: [{ keyfact: 0, item: keys.find(({ key }) => key.startsWith('state/'))?.key ?? null }] },
            readback: { answers: ['a', 'b', 'c', 'd', 'e', 'f'] },
            grade: { grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: true, critique: '' })) },
            cover: { keyfacts: ['the cart'], coverage: [{ keyfact: 0, item: keys.find(({ key }) => key.startsWith('state/'))?.key ?? null }] },
        };
        return Promise.resolve({ kind: 'said', text: JSON.stringify(answers[task]), costUsd: 0 });
    },
};

test('the judge over a replay: every run of the replay is scored like a stored one, and the 1.x chapters of a tab are compared beside it', async () => {
    const { summarizer } = scripted([[add('goal', 'Add a cart to the shop')], [add('done', 'Added cart totals in src/totals.ts')], [], [], [], []]);
    const scratch = scratchStore();
    try {
        await replay({ reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, repos: NO_REPOS, language: 'en', log: () => undefined, writerView: FULL_WRITER_VIEW }, FILE, 'replay:t1', statSync(FILE).size);
        const imported = [{ n: 1, at: Date.parse('2026-10-07T09:20:00Z'), items: [{ key: 'state/t1/goal/0', section: 'goal', text: 'Shop with a cart', fact: 'state/t1/goal/0', born: false, anchor: null }, { key: 'state/t1/done/0', section: 'done', text: 'Cart totals added in src/totals.ts', fact: 'state/t1/done/0', born: false, anchor: null }] }];
        const lines = await judgedReport({ judge: lenient, store: scratch.store, rubric: 'rubric', label: 'replay:t1', imported, beside: 'w1:t9', style: styleFor(process.stdout), err: () => undefined });
        const text = lines.join('\n');
        assert.match(text, /the judge over the replay \(2 runs\)/);
        assert.match(text, /the last good 1\.x recap of each chapter of w1:t9 against the replay's ledger state at the same time/);
        assert.match(text, /chapter 1 \(2026-10-07 09:20, 1 key facts\)/);
        assert.match(text, /I1/);
        assert.equal(scratch.store.verdicts.ofRun(scratch.store.inputs.runs({ tab: 'replay:t1', since: null, limit: 5, withInput: true })[0]?.id ?? '').length > 0, true, 'the replay\'s verdicts are kept in the scratch store');
    } finally {
        scratch.dispose();
    }
});
