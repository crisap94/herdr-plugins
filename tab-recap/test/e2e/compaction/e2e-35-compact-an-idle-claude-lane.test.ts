import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { add } from '../support/engine-world.ts';
import type { Column } from '../support/recap-daemon-world.ts';
import { BRIEF, compactionWorld, SESSION, type CompactionWorld } from '../support/compaction-world.ts';

const first = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });
const sqlite = add('decisions', 'Use SQLite, no server', 'Use SQLite for it, no server', 'one file, nothing to run');
const second = JSON.stringify({ ops: [sqlite] });
const naming = JSON.stringify({ ops: [sqlite, add('decisions', 'Show the recap column in three lines', 'Use SQLite for it, no server')] });

async function ready(env: Readonly<Record<string, string>>, panes: readonly string[] = ['w1:p1'], refreshed: string = second): Promise<CompactionWorld> {
    const made = await compactionWorld(env);
    made.world.model.answer(1, first);
    made.world.model.answer(2, refreshed);
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    made.world.announce(panes);
    made.world.grow(1);
    await made.world.start();
    made.world.turn();
    await made.world.until(() => (made.world.rows('SELECT id FROM run').length === 1 ? true : undefined), 'the first run');
    return made;
}

describe('compact on an idle claude lane, with a brief written by the model', () => {
    let made: CompactionWorld;
    let column: Column;

    before(async () => {
        made = await ready({ TAB_RECAP_COMPACT_BY: 'custom', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p1' }) }, ['w1:p1', 'w1:p3']);
    });

    after(async () => {
        await made.close();
    });

    test('compact with a note says the compaction was requested', { timeout: 30_000 }, async () => {
        made.world.grow(1);
        const ran = await made.world.world.command('compact', '--note', 'the retry test');
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stdout, 'tab-recap: compaction requested\n');
    });

    test('the recap is refreshed before anything is typed', { timeout: 30_000 }, async () => {
        await made.awaitTyped(1);
        assert.deepEqual(made.world.rows('SELECT cause FROM run ORDER BY at').map((row) => row['cause']), ['turn-ended', 'requested']);
    });

    test('the operator is told the brief is being written', { timeout: 30_000 }, () => {
        assert.ok(made.toasts().includes('Compact claude | Writing what claude should keep…'), JSON.stringify(made.toasts()));
    });

    test('one line is typed as the operator would: /compact, the brief, Enter', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(3), ['text /compact ', `text ${BRIEF}`, 'keys enter']);
        assert.equal(made.world.world.herdr.requests().filter((each) => each.method === 'agent.prompt').length, 0, 'nothing is pasted or prompted');
    });

    test('the brief was written from the recap and its decisions, and from the recent turns', { timeout: 30_000 }, () => {
        const document = made.world.model.calls().at(-1) ?? '';
        assert.ok(document.includes('Add a cart to the shop'), document);
        assert.ok(document.includes('Use SQLite, no server') && document.includes('one file, nothing to run'), document);
    });

    test('the brief document holds the operator note, and the note is not appended to the brief typed', { timeout: 30_000 }, () => {
        assert.ok((made.world.model.calls().at(-1) ?? '').includes('the retry test'));
        assert.ok(!made.typed().join('\n').includes('the retry test'));
    });

    test('herdr cannot hold the typing lease, and the line is typed all the same', { timeout: 30_000 }, async () => {
        await made.world.world.awaitLog(/typing lease: herdr cannot take or read it; typing without it until it can/u);
        assert.equal(made.typedCount(), 3);
    });

    test('while it is typed the record says compacting, with the brief and its writer', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('compacting');
        assert.equal(row['brief'], 'written');
        assert.match(String(row['writer']), /^custom/u);
        assert.equal(row['template_why'], null);
        assert.equal(row['origin'], 'operator');
        assert.equal(row['finished_at'], null);
    });

    test('the lane is not compacted twice: Enter was pressed once', { timeout: 30_000 }, () => {
        assert.equal(made.typed().filter((each) => each === 'keys enter').length, 1);
    });

    test('the agent compacts: the record is compacted, with the numbers the transcript gave', { timeout: 30_000 }, async () => {
        const typedAt = Date.now();
        assert.equal((await made.hook('/pre-compact/claude', { session_id: SESSION, trigger: 'manual' })).status, 200);
        made.mark(typedAt);
        made.world.status('working');
        made.world.status('idle');
        const row = await made.awaitStage('compacted');
        assert.deepEqual([row['tokens_before'], row['tokens_after'], row['took_ms'], row['retried'], row['why']], [39532, 3057, 15588, 0, null]);
        assert.notEqual(row['finished_at'], null);
    });

    test('the operator is told, once, with the numbers', { timeout: 30_000 }, async () => {
        await made.world.until(() => (made.toasts().some((each) => each.startsWith('Compact claude | claude compacted')) ? true : undefined), 'the end toast');
        assert.deepEqual(made.toasts().filter((each) => each.includes('compacted')), ['Compact claude | claude compacted: 39.5k → 3.1k tokens in 16 s']);
    });

    test('the stage is shown on the column of the tab', { timeout: 30_000 }, async () => {
        column = made.world.column(60, 40);
        const screen = await column.painted((shown) => shown.text.includes('compacted 39.5k → 3.1k · 16 s'), 'the compacted stage on the column');
        assert.ok(screen.text.includes('✓ compacted 39.5k → 3.1k · 16 s'), screen.text);
    });

    test('the agent is told where things stand through its restore hook', { timeout: 30_000 }, async () => {
        const replied = await made.sessionStart();
        assert.equal(replied.status, 200);
        const context = (JSON.parse(replied.body) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
        assert.ok(context.includes('## Goal') && context.includes('Add a cart to the shop'), context);
        assert.ok(context.includes('## Decisions') && context.includes('Use SQLite, no server') && context.includes('reason: one file, nothing to run'), context);
    });

    test('the compaction is a boundary of the lane, a new chapter', { timeout: 30_000 }, async () => {
        const kinds = await made.world.until(() => {
            const rows = made.world.rows('SELECT kind, trigger FROM boundary').map((row) => [row['kind'], row['trigger']]);
            return rows.length === 0 ? undefined : rows;
        }, 'the boundary of the compaction');
        assert.deepEqual(kinds, [['compacted', 'plugin']]);
    });

    test('an idle push and a working push of another lane do not take the stage away', { timeout: 30_000 }, async () => {
        made.world.status('idle');
        made.world.status('working', 'w1:p3');
        const screen = await column.painted((shown) => shown.text.includes('working · claude w1:p3'), 'the other lane working');
        assert.ok(screen.text.includes('✓ compacted 39.5k → 3.1k · 16 s'), screen.text);
        assert.equal(made.compactions()[0]?.['dismissed_at'], null);
    });

    test('when the agent works again the shown stage disappears', { timeout: 30_000 }, async () => {
        made.world.status('working');
        const screen = await column.painted((shown) => !shown.text.includes('compacted 39.5k') && shown.text.includes('● working'), 'the column without the stage');
        assert.ok(!screen.text.includes('✓ compacted'), screen.text);
        assert.notEqual(made.compactions()[0]?.['dismissed_at'], null);
    });
});

const GUIDANCE_TAIL = 'Drop raw command output, the details of steps that are finished, and dead ends we already resolved.';

async function compactAndFinish(made: CompactionWorld, ...args: readonly string[]): Promise<readonly string[]> {
    const already = made.typedCount();
    const ran = await made.world.world.command('compact', ...args);
    assert.equal(ran.code, 0, ran.stderr);
    const typed = await made.awaitTyped(already + 3);
    await made.compacts();
    return typed.slice(already);
}

describe('compact on an idle claude lane, with no brief job: the template of the recap is typed', () => {
    let made: CompactionWorld;
    let typed: readonly string[];

    before(async () => {
        made = await ready({ TAB_RECAP_COMPACT_BY: 'off' }, ['w1:p1'], naming);
        made.world.grow(1);
    });

    after(async () => {
        await made.close();
    });

    test('the guidance is one numbered line: the note first, then the goal and the decisions with their reason', { timeout: 30_000 }, async () => {
        typed = await compactAndFinish(made, '--note', 'the retry test');
        assert.equal(typed[0], 'text /compact ');
        assert.equal(typed[2], 'keys enter');
        assert.equal(typed[1], `text When you summarize this conversation, keep these, most important first: (1) Above all, keep: the retry test (2) What I want: Add a cart to the shop (3) Decisions we made, and why: Use SQLite, no server. ${GUIDANCE_TAIL}`);
    });

    test('the record says template, with no writer and no reason', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('compacted');
        assert.deepEqual([row['brief'], row['writer'], row['template_why']], ['template', null, null]);
    });

    test('a recap item that names the plugin is left out of the template', { timeout: 30_000 }, () => {
        assert.ok(!(typed[1] ?? '').includes('three lines'), typed[1]);
        assert.ok((typed[1] ?? '').includes('Use SQLite, no server'));
    });

    test('the template never names the plugin to the agent', { timeout: 30_000 }, () => {
        assert.ok(!/recap|\btabs?\b|tool/iu.test(typed[1] ?? ''), typed[1]);
    });

    test('a compaction asked with no note leaves no trace of one', { timeout: 30_000 }, async () => {
        made.world.status('working');
        made.world.status('idle');
        const again = await compactAndFinish(made);
        assert.equal(again[1], `text When you summarize this conversation, keep these, most important first: (1) What I want: Add a cart to the shop (2) Decisions we made, and why: Use SQLite, no server. ${GUIDANCE_TAIL}`);
    });
});

describe('compact on an idle claude lane whose writer answers badly', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready({ TAB_RECAP_COMPACT_BY: 'custom' });
        made.world.grow(1);
        made.world.model.answer(3, 'Keep the recap tab and its tool calls in mind.');
    });

    after(async () => {
        await made.close();
    });

    test('a brief that names the plugin is refused: the template is typed and the record says why', { timeout: 30_000 }, async () => {
        const typed = await compactAndFinish(made);
        assert.ok(typed[1]?.startsWith('text When you summarize this conversation, keep these'), typed[1]);
        const row = await made.awaitStage('compacted');
        assert.equal(row['brief'], 'template');
        assert.match(String(row['template_why']), /^the answer says "/u);
    });

    test('a writer that fails gives no brief: the template is typed and the record says why', { timeout: 30_000 }, async () => {
        made.world.model.answer('default', '!fail');
        made.world.status('working');
        made.world.status('idle');
        const typed = await compactAndFinish(made);
        assert.ok(typed[1]?.startsWith('text When you summarize this conversation, keep these'), typed[1]);
        const rows = made.compactions().filter((row) => row['brief'] === 'template');
        assert.equal(rows.length, 2);
        assert.match(String(rows.at(-1)?.['template_why']), /scripted model failed/u);
    });

    test('a brief longer than 3000 characters is cut at a sentence', { timeout: 30_000 }, async () => {
        made.world.model.answer('default', Array.from({ length: 300 }, (_, at) => `Sentence ${at} is kept.`).join(' '));
        made.world.status('working');
        made.world.status('idle');
        const typed = await compactAndFinish(made);
        const brief = (typed[1] ?? '').slice('text '.length);
        assert.ok(brief.length <= 3000 && brief.length > 2900, String(brief.length));
        assert.ok(brief.endsWith('is kept.') && brief.startsWith('Sentence 0 is kept.'), brief.slice(-40));
    });
});

describe('compact on an idle claude lane: where the compaction is confirmed', () => {
    const NEW_SESSION = '00000000-0000-4000-8000-0000000000b2';

    test('a resumed agent: herdr reports its new session, and the compaction is confirmed in that session', { timeout: 30_000 }, async () => {
        const made = await ready({ TAB_RECAP_COMPACT_BY: 'custom' });
        try {
            made.world.transcript(NEW_SESSION, ['Pick up the cart where we left it']);
            made.agentIs('idle', NEW_SESSION);
            made.world.grow(1);
            const ran = await made.world.world.command('compact');
            assert.equal(ran.code, 0, ran.stderr);
            await made.awaitTyped(3);
            const typedAt = Date.now();
            appendFileSync(join(made.world.world.home, '.claude', 'projects', '-work', `${NEW_SESSION}.jsonl`), `${JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 12000, postTokens: 2000, durationMs: 4000 }, timestamp: new Date(typedAt).toISOString(), sessionId: NEW_SESSION })}\n`);
            made.settle();
            const row = await made.awaitStage('compacted');
            assert.deepEqual([row['tokens_before'], row['tokens_after']], [12000, 2000]);
        } finally {
            await made.close();
        }
    });

    test('a brand-new agent: its lane has no session yet, herdr reports one now, and the compaction is confirmed in that session', { timeout: 30_000 }, async () => {
        const made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom' });
        try {
            made.world.model.answer('default', BRIEF);
            made.world.typing();
            made.lanes([{ pane: 'w1:p1', agent: 'claude', status: 'idle' }]);
            made.world.transcript(NEW_SESSION, ['Start the cart']);
            made.agentIs('idle', NEW_SESSION);
            await made.world.start();
            const ran = await made.world.world.command('compact');
            assert.equal(ran.code, 0, ran.stderr);
            await made.awaitTyped(3);
            appendFileSync(join(made.world.world.home, '.claude', 'projects', '-work', `${NEW_SESSION}.jsonl`), `${JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 8000, postTokens: 1000, durationMs: 3000 }, timestamp: new Date().toISOString(), sessionId: NEW_SESSION })}\n`);
            made.settle();
            const row = await made.awaitStage('compacted');
            assert.deepEqual([row['tokens_before'], row['tokens_after']], [8000, 1000]);
        } finally {
            await made.close();
        }
    });

    test('a mark older than the command does not count: the end is not confirmed, and the operator is told', { timeout: 30_000 }, async () => {
        const made = await ready({ TAB_RECAP_COMPACT_BY: 'custom' });
        try {
            made.mark(Date.now() - 60_000);
            made.world.grow(1);
            const ran = await made.world.world.command('compact');
            assert.equal(ran.code, 0, ran.stderr);
            await made.awaitTyped(3);
            made.settle();
            const row = await made.awaitStage('unconfirmed');
            assert.equal(row['retried'], 0);
            await made.world.until(() => (made.toasts().includes('Compact claude | claude: could not confirm the compaction — check it') ? true : undefined), 'the not confirmed toast');
            assert.equal(made.typed().filter((each) => each === 'keys enter').length, 1, 'not tried a second time');
        } finally {
            await made.close();
        }
    });
});

describe('compact on an idle claude lane whose own summary fails', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready({ TAB_RECAP_COMPACT_BY: 'custom' });
    });

    after(async () => {
        await made.close();
    });

    test('the first try fails: the same line is typed a second time, once', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        const tried = await made.awaitTyped(3);
        made.failMark();
        made.settle();
        const both = await made.awaitTyped(6);
        assert.deepEqual(both.slice(3), tried);
    });

    test('the second try works: the record says compacted on the second try, and the operator is told so', { timeout: 30_000 }, async () => {
        made.mark();
        made.settle();
        const row = await made.awaitStage('compacted');
        assert.equal(row['retried'], 1);
        await made.world.until(() => (made.toasts().some((each) => each.includes('claude compacted (on the second try)')) ? true : undefined), 'the second try toast');
        assert.equal(made.toasts().filter((each) => each.includes('Writing what claude should keep')).length, 1, 'announced once');
    });
});

describe('compact on an idle claude lane whose own summary fails twice', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready({ TAB_RECAP_COMPACT_BY: 'custom' });
    });

    after(async () => {
        await made.close();
    });

    test('it is tried twice and not a third time, and the record says failed with the reason', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        await made.awaitTyped(3);
        made.failMark();
        made.settle();
        await made.awaitTyped(6);
        made.failMark();
        made.settle();
        const row = await made.awaitStage('failed');
        assert.deepEqual([row['retried'], row['why']], [1, 'its own summary failed, twice']);
        await made.world.until(() => (made.toasts().includes('Compact claude | claude could not compact, even after trying again') ? true : undefined), 'the failure toast');
        assert.equal(made.typed().filter((each) => each === 'keys enter').length, 2);
    });
});
