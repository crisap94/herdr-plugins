import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLabelled, readPoints } from '#src/adapters/experiment/data.ts';
import { doneKeys } from '#src/adapters/experiment/io.ts';
import type { Point } from '#src/adapters/experiment/point.ts';
import { must } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';

const txt = (value: string): Text => must(parseText(value));

const bare: Point = {
    id: textOf('p-bare'), tab: textOf('t1'), pane: textOf('1-1'), at: instant(1_000), source: textOf('/s.jsonl'), cursor: countOf(0), transcript: textOf('AB'), stratum: textOf('cold'),
    share: null, tokens: null, window: null, inFlight: 'unknown', lastBreakAt: null, gate: 'no-context',
    state: { last_prompt: null, last_reply: null, recent_turns: [], goal: null, open_work: [] },
    recent: [], history: [], hindsight: { next_prompt: null, following: [] },
};

const full: Point = {
    id: textOf('p-full'), tab: textOf('t2'), pane: textOf('2-1'), at: instant(2_000), source: textOf('/s2.jsonl'), cursor: countOf(512), transcript: textOf('CD'), stratum: textOf('hot'),
    share: countOf(62), tokens: countOf(120_000), window: countOf(200_000), inFlight: countOf(2), lastBreakAt: instant(1_500), gate: 'ask',
    state: {
        last_prompt: textOf('fix it'), last_reply: textOf('done'), recent_turns: [{ role: 'user', text: textOf('fix it') }, { role: 'tool', text: textOf('shell: ls') }],
        goal: textOf('ship'), open_work: [{ section: textOf('now'), text: textOf('tests') }],
    },
    recent: [
        { role: 'user', text: textOf('fix it'), at: instant(1_900), queued: false },
        { role: 'tool', text: textOf('ls'), kind: 'shell', what: textOf('ls -la'), queued: true },
    ],
    history: [{ section: 'goal', text: textOf('ship'), why: textOf('because'), state: 'closed', closedWhy: 'done', closedAt: instant(1_800), firstAt: instant(1_100), lastAt: instant(1_700) }],
    hindsight: { next_prompt: textOf('next'), following: [{ role: 'agent', text: textOf('ok') }, { role: 'tool', kind: 'edit', text: textOf('patched') }] },
};

const inDir = (body: (dir: string) => void): void => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-readers-'));
    try {
        body(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

test('readers: a corpus written with JSON.stringify reads back as the same points', () => {
    inDir((dir) => {
        const file = join(dir, 'corpus.jsonl');
        writeFileSync(file, `${[bare, full].map((point) => JSON.stringify(point)).join('\n')}\n`);
        assert.deepEqual(readPoints(txt(file)), [bare, full]);
    });
});

test('readers: a point with a field of the wrong type is refused', () => {
    inDir((dir) => {
        const file = join(dir, 'corpus.jsonl');
        writeFileSync(file, `${JSON.stringify({ ...bare, cursor: 'x' })}\n`);
        assert.throws(() => readPoints(txt(file)), TypeError);
        writeFileSync(file, `${JSON.stringify({ ...bare, gate: 'nonsense' })}\n`);
        assert.throws(() => readPoints(txt(file)), TypeError);
        writeFileSync(file, `${JSON.stringify({ ...full, recent: [{ role: 'robot', text: 'x' }] })}\n`);
        assert.throws(() => readPoints(txt(file)), TypeError);
        writeFileSync(file, `${JSON.stringify({ ...full, recent: [{ role: 'user', text: 'x', queued: 'yes' }] })}\n`);
        assert.throws(() => readPoints(txt(file)), TypeError);
    });
});

test('readers: operator and labeller label rows are read, the labeller extras ignored', () => {
    inDir((dir) => {
        const operator = join(dir, 'operator-labels.jsonl');
        const labeller = join(dir, 'labels.jsonl');
        writeFileSync(operator, `${JSON.stringify({ id: 'p-bare', labels: { q1: 1, q2: 0 }, at: 5 })}\n`);
        writeFileSync(labeller, `${JSON.stringify({ id: 'p-full', labels: { q1: 0, q2: 1 }, ms: 40, attempts: 1, labeller: 'codex/m/low' })}\n`);
        assert.deepEqual(readLabelled(txt(operator)), [{ id: 'p-bare', labels: new Map([['q1', 1], ['q2', 0]]) }]);
        assert.deepEqual(readLabelled(txt(labeller)), [{ id: 'p-full', labels: new Map([['q1', 0], ['q2', 1]]) }]);
        writeFileSync(labeller, `${JSON.stringify({ id: 'p-full', labels: { q1: 2 } })}\n`);
        assert.throws(() => readLabelled(txt(labeller)), TypeError);
    });
});

test('readers: a missing file reads as empty and blank lines are skipped', () => {
    inDir((dir) => {
        assert.deepEqual(readPoints(txt(join(dir, 'none.jsonl'))), []);
        assert.deepEqual(readLabelled(txt(join(dir, 'none.jsonl'))), []);
        const file = join(dir, 'labels.jsonl');
        writeFileSync(file, `\n${JSON.stringify({ id: 'a', labels: {} })}\n\n  \n`);
        appendFileSync(file, `${JSON.stringify({ id: 'b', labels: { q: 1 } })}\n`);
        assert.deepEqual(readLabelled(txt(file)).map((row) => row.id), ['a', 'b']);
    });
});

test('readers: doneKeys reads a numeric id as text and a null row throws as it always did', () => {
    inDir((dir) => {
        const file = join(dir, 'rows.jsonl');
        writeFileSync(file, `${JSON.stringify({ id: 7 })}\n${JSON.stringify({ id: 'x' })}\n`);
        assert.deepEqual([...doneKeys(txt(file), txt('id'))], ['7', 'x']);
        appendFileSync(file, 'null\n');
        assert.throws(() => doneKeys(txt(file), txt('id')), { name: 'TypeError', message: "cannot read 'id' of null" });
    });
});
