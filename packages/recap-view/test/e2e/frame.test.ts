import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Break, CompactionRow, Row, SessionRecap } from '@stateforge-labs/recap-view';
import type { TextColumnView, TextExpandedView } from '@stateforge-labs/recap-view/unstable/model.ts';
import { figuresOf, stageClockOf, stageLine } from '@stateforge-labs/recap-view/unstable/compaction-stage.ts';
import { EXPANDED_TWO_COLUMNS, columnWidth, expanded } from '@stateforge-labs/recap-view/unstable/expanded.ts';
import { regionsOf, session } from '@stateforge-labs/recap-view/unstable/expanded-regions.ts';
import { groupsOf } from '@stateforge-labs/recap-view/unstable/groups.ts';
import { badge, firstItem, footer, present, presentBar } from '@stateforge-labs/recap-view/unstable/present.ts';
import { sessionLines, spanOf } from '@stateforge-labs/recap-view/unstable/session-lines.ts';
import { clockOf, dateLines, dayOf, timelineOf } from '@stateforge-labs/recap-view/unstable/timeline.ts';
import { breakLine, breakText, chaptersFact } from '@stateforge-labs/recap-view/unstable/timeline-breaks.ts';
import { assertAmount, assertCount, assertMinutes, assertPercent, assertSeconds } from '@stateforge-labs/recap-view/unstable/wording.ts';
import type { TextWording } from '@stateforge-labs/recap-view/unstable/wording.ts';
import { plain } from '@stateforge-labs/recap-view/unstable/wrap.ts';

const wording: TextWording = {
    locale: 'en',
    badge: { working: 'working', blocked: 'blocked', idle: 'idle', done: 'done', unknown: 'unknown' },
    waitingForAgent: 'waiting for an agent',
    fromScreen: '(screen)',
    recapTitle: 'RECAP',
    taskNumber: (n) => `task ${n}`,
    updating: 'updating',
    daemonStale: (daemon) => `daemon ${daemon ?? 'none'} is stale`,
    claudeOwn: 'their own words',
    noRecapYet: 'no recap yet',
    noRecapShort: 'no recap',
    allDoneShort: 'all done',
    recapError: (error) => `error: ${error}`,
    needsYou: (what) => `needs you: ${what}`,
    ago: (amount, unit) => `${amount} ${unit} ago`,
    hints: { column: ['a long column hint', 'hint'], modal: ['modal hint'] },
    compaction: {
        hint: (percent, window) => `${percent}% of ${window}`,
        stage: {
            queued: (agent, clock) => `${agent ?? 'agent'} queued ${clock}`,
            briefing: (agent, writer, clock) => `${agent ?? 'agent'} briefed by ${writer ?? 'nobody'} ${clock}`,
            compacting: (agent, clock) => `${agent ?? 'agent'} compacting ${clock}`,
            restoring: (agent) => `${agent ?? 'agent'} restoring`,
            compacted: (agent, figures) => `${agent ?? 'agent'} compacted ${figures}`,
            template: 'template',
            failed: (agent, why) => `${agent ?? 'agent'} failed ${why ?? ''}`,
            unconfirmed: (agent, why) => `${agent ?? 'agent'} unconfirmed ${why ?? ''}`,
            skipped: (agent, why) => `${agent ?? 'agent'} skipped ${why ?? ''}`,
            tokens: (before, after) => `${before} to ${after}`,
            took: (seconds) => `${seconds} s`,
        },
    },
    expanded: {
        timeline: 'timeline',
        rules: 'rules',
        session: 'session',
        story: 'story',
        updatingStory: 'updating the story',
        waiting: (amount, unit) => `waiting ${amount} ${unit}`,
        closed: (why) => `closed ${why}`,
        started: 'started',
        turns: 'turns',
        compactions: 'compactions',
        compactionOrigin: { operator: (count) => `${count} by hand`, auto: (count) => `${count} auto` },
        of: 'of',
        repo: 'repo',
        branch: 'branch',
        files: 'files',
        causes: { 'turn-ended': 'turn ended', focused: 'focused', requested: 'requested' },
        autocompact: { label: 'autocompact', text: (decisions, compacted, waited) => `${decisions}/${compacted}/${waited}` },
    },
    chapters: {
        label: 'chapters',
        count: (chapters) => `${chapters} chapters`,
        compacted: 'compacted',
        newSession: 'new session',
        seconds: (seconds) => `${seconds} s`,
        minutes: (minutes, seconds) => `${minutes} min ${seconds} s`,
    },
};

const row = (id: string, extra: Partial<Row> = {}): Row => ({ id, agent: 'claude', state: 'working', title: null, cwd: null, fromScreen: false, harnessRecap: null, ...extra });

const view = (extra: Partial<TextColumnView> = {}): TextColumnView => ({
    rows: [row('p1', { title: 'Build', lastPrompt: 'ship it', fromScreen: true })],
    daemonVersion: '1.0.0',
    recap: { tasks: [{ name: 'build', members: ['p1'], sections: null, markdown: '## Now\n- writing tests' }], at: 0, running: false, backend: null, error: null },
    notes: new Map(),
    warnings: [],
    now: 60_000,
    wording,
    version: '1.0.0',
    style: plain,
    ...extra,
});

const record: CompactionRow = { pane: 'p1', stage: 'compacted', brief: 'written', writer: null, why: null, stageAt: 0, queued: false, tokensBefore: 150_000, tokensAfter: 30_000, tookMs: 65_000 };

const facts: SessionRecap = {
    started: { at: 0, forMs: 90 * 60_000 },
    runs: { total: 3, byCause: [{ cause: 'focused', count: 3 }] },
    compactions: { count: 2, byOrigin: { operator: 1, auto: 1 }, measured: [] },
    agents: [],
    repo: { name: 'app', branch: 'main' },
    files: [],
    chapters: 3,
    autocompact: null,
};

test('the brand assertions pass a number and refuse anything else', () => {
    for (const assertBrand of [assertCount, assertAmount, assertPercent, assertSeconds, assertMinutes]) {
        assert.doesNotThrow(() => assertBrand(2));
        assert.throws(() => assertBrand('2'), TypeError);
    }
});

test('present draws the row header, its prompt and the recap of the one task', () => {
    const lines = present(view(), 60, () => null);
    assert.equal(lines[0], 'Build');
    assert.ok(lines.some((line) => line.includes('claude p1 (screen)')));
    assert.ok(lines.some((line) => line.includes('› ship it')));
    assert.ok(lines.some((line) => line.includes('writing tests')));
    assert.deepEqual(present(view({ rows: null }), 60, () => null), ['waiting for an agent']);
});

test('presentBar shows the stage of a compaction before the recap lead', () => {
    assert.match(presentBar(view({ compactions: [{ ...record, agent: 'claude', startedAt: 0 }] }), 80)[0] ?? '', /claude compacted 150k → 30k · 65 s/);
    assert.match(presentBar(view(), 80)[0] ?? '', /writing tests/);
});

test('badge, footer and firstItem read the wording and the markdown', () => {
    assert.equal(badge('blocked', wording, plain), '● blocked');
    assert.equal(footer(4, 'column', wording, plain), 'hint');
    assert.equal(firstItem('## Now\n- first\n- second', 'now'), 'first');
});

test('groupsOf splits the rows by the members of each task', () => {
    const rows = [row('p1'), row('p2')];
    assert.deepEqual(groupsOf(rows, [{ name: 'a', members: ['p1'], sections: null, markdown: '' }, { name: 'b', members: ['p2'], sections: null, markdown: '' }]).map((group) => group.lanes.map((each) => each.id)), [['p1'], ['p2']]);
});

test('the compaction stage draws its clock, its figures and its line', () => {
    assert.equal(stageClockOf(0, 65_000), '1:05');
    assert.deepEqual(figuresOf(record, wording), { pair: '150k → 30k', tokens: '150k to 30k', took: '65 s' });
    assert.equal(stageLine({ ...record, stage: 'compacting' }, 5000, { wording, style: plain }, 'claude'), '◐ claude compacting 0:05');
});

test('the session lines and the timeline read the session recap', () => {
    assert.equal(spanOf(90 * 60_000), '1 h 30 min');
    const lines = sessionLines(facts, { now: 0, zone: 'UTC', wording });
    assert.deepEqual(lines.map((line) => line.label), ['started', 'turns', 'compactions', 'repo']);
    assert.equal(lines[2]?.text, '2 (1 by hand · 1 auto) · 3 chapters');
    assert.equal(clockOf(0, 'UTC'), '00:00');
    assert.equal(dayOf(0, 'UTC'), '1970-01-01');
    assert.deepEqual(dateLines([0, 86_400_000], 86_400_000, 'UTC'), ['1970-01-01', '1970-01-02']);
    assert.deepEqual(timelineOf([]), []);
});

test('a chapter break names the compaction and its figures', () => {
    const found: Break = { kind: 'compacted', at: 0, trigger: 'auto', tokensBefore: 150_000, tokensAfter: 30_000, tookMs: 65_000 };
    assert.equal(breakText(found, wording.chapters), 'compacted 150k → 30k · 1 min 5 s');
    assert.equal(breakLine({ ...found, kind: 'switched' }, wording.chapters), '── new session ──');
    assert.equal(chaptersFact(3, wording.chapters), '3 chapters');
});

test('expanded draws the story head and the session; wide views split into columns', () => {
    const expandedView: TextExpandedView = { tasks: [{ name: '', facts: [], story: { text: 'the story so far', at: 0 }, curating: false }], session: facts, width: 60, wording, style: plain, now: 0, zone: 'UTC', webs: [] };
    const lines = expanded(expandedView);
    assert.equal(lines[0], 'STORY · 00:00');
    assert.ok(lines.includes('SESSION'));
    assert.equal(columnWidth(EXPANDED_TWO_COLUMNS), 68);
    const draw = { width: 60, style: plain, wording, now: 0, zone: 'UTC', webs: [], breaks: [] };
    assert.deepEqual(regionsOf({ facts: [], story: null, curating: true }, draw).head, ['STORY · updating the story']);
    assert.equal(session(facts, draw)[0], 'SESSION');
});
