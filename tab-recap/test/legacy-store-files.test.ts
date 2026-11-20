import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyHidden, parseLegacyRecapFile, parseLegacyVisibility, parseLegacyViewFile } from '#src/ports/legacy-store-files.ts';

const cursor = { pane: 'w1:p1', agent: 'claude', transcript: '/t/a.jsonl', cursor: 42, tail: 'tail', title: 'build', lastPrompt: 'fix it', claudeRecap: null };

const task = { id: 'k9', name: 'Ship', lanes: ['w1:p1'], sections: { goal: 'ship', now: ['a'], needs: [], done: ['b'], decisions: [], next: [], links: ['https://x.example'] }, markdown: '## Ship' };

test('a full v1 recap file parses its cursors, tasks, instant, flags and language', () => {
    const file = { tab: 'w1:t1', lanes: [cursor], tasks: [task], at: 1700, running: true, backend: 'claude', error: null, costUsd: 0.25, language: 'de' };
    assert.deepEqual(parseLegacyRecapFile(file), {
        kind: 'ok',
        value: {
            tab: 'w1:t1', lanes: [cursor], at: 1700, running: true, backend: 'claude', error: null, costUsd: 0.25, language: 'de',
            tasks: [{ ...task, sections: { ...task.sections, rules: [] } }],
        },
    });
    const bare = { tab: 'w1:t2', lanes: [], costUsd: 0 };
    assert.deepEqual(parseLegacyRecapFile(bare), { kind: 'ok', value: { tab: 'w1:t2', lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' } });
});

test('a pre-tasks recap file becomes one task from its markdown, sections and lane panes', () => {
    const file = { tab: 'w1:t3', lanes: [cursor, { ...cursor, pane: 'w1:p4' }], markdown: '## Old', sections: { goal: 'g', now: ['n'] }, costUsd: 1, language: '' };
    const sections = { goal: 'g', now: ['n'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    assert.deepEqual(parseLegacyRecapFile(file), {
        kind: 'ok',
        value: { tab: 'w1:t3', lanes: [cursor, { ...cursor, pane: 'w1:p4' }], tasks: [{ id: 't1', name: '', lanes: ['w1:p1', 'w1:p4'], sections, markdown: '## Old' }], at: null, running: false, backend: null, error: null, costUsd: 1, language: 'en' },
    });
});

test('a view file without cwd or daemonVersion keeps them null and fills web and context with null', () => {
    const view = { tab: 'w1:t1', column: 'c1', at: 9, lanes: [{ pane: 'w1:p1', agent: 'codex', status: 'idle', title: null }] };
    assert.deepEqual(parseLegacyViewFile(view), {
        kind: 'ok',
        value: { tab: 'w1:t1', column: 'c1', at: 9, daemonVersion: null, lanes: [{ pane: 'w1:p1', agent: 'codex', status: 'idle', title: null, cwd: null, lastPrompt: null, web: null, context: null }] },
    });
});

test('a hidden file keeps only string entries and reads all as a true flag', () => {
    assert.deepEqual(parseLegacyHidden({ all: true, hidden: ['a', 1] }), { kind: 'ok', value: { all: true, hidden: ['a'], shown: [] } });
    assert.deepEqual(parseLegacyHidden({ all: 'yes', shown: ['b'] }), { kind: 'ok', value: { all: false, hidden: [], shown: ['b'] } });
});

test('a visibility ask keeps a boolean or toggle request and refuses an empty target', () => {
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: 'toggle' }), { kind: 'ok', value: { target: 'w1:t1', hidden: 'toggle' } });
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: false }), { kind: 'ok', value: { target: 'w1:t1', hidden: false } });
    assert.deepEqual(parseLegacyVisibility({ target: '', hidden: true }), { kind: 'err', error: { kind: 'empty' } });
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: 'maybe' }), { kind: 'err', error: { kind: 'out-of-range' } });
});

test('each parser refuses a non-object input as not-a-row', () => {
    for (const parse of [parseLegacyRecapFile, parseLegacyViewFile, parseLegacyHidden, parseLegacyVisibility]) {
        assert.deepEqual(parse(null), { kind: 'err', error: { kind: 'not-a-row' } });
        assert.deepEqual(parse('text'), { kind: 'err', error: { kind: 'not-a-row' } });
    }
});
