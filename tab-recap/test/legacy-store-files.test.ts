import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyHidden, parseLegacyRecapFile, parseLegacyVisibility, parseLegacyViewFile } from '#src/ports/legacy-store-files.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { cursorOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { hiddenStateOf } from '#test/support/seen.ts';

const cursor = { pane: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/a.jsonl'), cursor: cursorOf(42), tail: textOf('tail'), title: textOf('build'), lastPrompt: textOf('fix it'), claudeRecap: null };

const sessionOf = ({ pane, claudeRecap, ...rest }: typeof cursor): object => ({ key: pane, ...rest, harnessRecap: claudeRecap });

const taskOut = ({ lanes, ...rest }: { readonly id: string; readonly name: string; readonly lanes: readonly string[]; readonly sections: unknown; readonly markdown: string }): object => ({ ...rest, sessions: lanes });

const task = { id: 'k9', name: 'Ship', lanes: ['w1:p1'], sections: { goal: 'ship', now: ['a'], needs: [], done: ['b'], decisions: [], next: [], links: ['https://x.example'] }, markdown: '## Ship' };

test('a full v1 recap file parses its cursors, tasks, instant, flags and language', () => {
    const file = { tab: 'w1:t1', lanes: [cursor], tasks: [task], at: 1700, running: true, backend: 'claude', error: null, costUsd: 0.25, language: 'de' };
    assert.deepEqual(parseLegacyRecapFile(file), {
        kind: 'ok',
        value: {
            scope: 'w1:t1', sessions: [sessionOf(cursor)], at: 1700, running: true, backend: 'claude', error: null, costUsd: 0.25, language: 'de',
            tasks: [taskOut({ ...task, sections: { ...task.sections, rules: [] } })],
        },
    });
    const bare = { tab: 'w1:t2', lanes: [], costUsd: 0 };
    assert.deepEqual(parseLegacyRecapFile(bare), { kind: 'ok', value: { scope: 'w1:t2', sessions: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' } });
});

test('a pre-tasks recap file becomes one task from its markdown, sections and lane panes', () => {
    const file = { tab: 'w1:t3', lanes: [cursor, { ...cursor, pane: 'w1:p4' }], markdown: '## Old', sections: { goal: 'g', now: ['n'] }, costUsd: 1, language: '' };
    const sections = { goal: 'g', now: ['n'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    assert.deepEqual(parseLegacyRecapFile(file), {
        kind: 'ok',
        value: { scope: 'w1:t3', sessions: [sessionOf(cursor), sessionOf({ ...cursor, pane: paneId('w1:p4') })], tasks: [{ id: 't1', name: '', sessions: ['w1:p1', 'w1:p4'], sections, markdown: '## Old' }], at: null, running: false, backend: null, error: null, costUsd: 1, language: 'en' },
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
    assert.deepEqual(parseLegacyHidden({ all: true, hidden: ['a', 1] }), { kind: 'ok', value: hiddenStateOf({ all: true, hidden: ['a'], shown: [] }) });
    assert.deepEqual(parseLegacyHidden({ all: 'yes', shown: ['b'] }), { kind: 'ok', value: hiddenStateOf({ all: false, hidden: [], shown: ['b'] }) });
});

test('a visibility ask keeps a boolean or toggle request and refuses an empty target', () => {
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: 'toggle' }), { kind: 'ok', value: { target: 'w1:t1', visibility: 'toggle' } });
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: false }), { kind: 'ok', value: { target: 'w1:t1', visibility: 'shown' } });
    assert.deepEqual(parseLegacyVisibility({ target: '', hidden: true }), { kind: 'err', error: { kind: 'empty' } });
    assert.deepEqual(parseLegacyVisibility({ target: 'w1:t1', hidden: 'maybe' }), { kind: 'err', error: { kind: 'out-of-range' } });
});

test('each parser refuses a non-object input and an array as not-a-row', () => {
    for (const parse of [parseLegacyRecapFile, parseLegacyViewFile, parseLegacyHidden, parseLegacyVisibility]) {
        assert.deepEqual(parse(null), { kind: 'err', error: { kind: 'not-a-row' } });
        assert.deepEqual(parse('text'), { kind: 'err', error: { kind: 'not-a-row' } });
        assert.deepEqual(parse([]), { kind: 'err', error: { kind: 'not-a-row' } });
    }
});

test('a recap without costUsd reads it as 0 and a non-object task item becomes an empty numbered task', () => {
    const file = { tab: 'w1:t4', lanes: [], tasks: [task, 'junk'] };
    const empty = { id: 't2', name: '', sessions: [], sections: null, markdown: '' };
    assert.deepEqual(parseLegacyRecapFile(file), {
        kind: 'ok',
        value: { scope: 'w1:t4', sessions: [], tasks: [taskOut({ ...task, sections: { ...task.sections, rules: [] } }), empty], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' },
    });
});

test('a view without at reads it as 0', () => {
    assert.deepEqual(parseLegacyViewFile({ tab: 'w1:t1', column: null }), { kind: 'ok', value: { tab: 'w1:t1', column: null, at: 0, daemonVersion: null, lanes: [] } });
});

test('a lane the store cannot import is refused', () => {
    const { cursor: _, ...noCursor } = cursor;
    assert.deepEqual(parseLegacyRecapFile({ tab: 'w1:t1', lanes: [noCursor] }), { kind: 'err', error: { kind: 'not-a-number' } });
    assert.deepEqual(parseLegacyRecapFile({ tab: 'w1:t1' }), { kind: 'err', error: { kind: 'not-a-row' } });
    assert.deepEqual(parseLegacyViewFile({ tab: 'w1:t1', at: 1, lanes: [{ pane: 'w1:p1', agent: 'codex' }] }), { kind: 'err', error: { kind: 'not-a-string' } });
    assert.deepEqual(parseLegacyViewFile({ tab: 'w1:t1', at: 1, lanes: [null] }), { kind: 'err', error: { kind: 'not-a-row' } });
});
