import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import { targetsOf } from '#src/recap/application/compaction-targets.ts';
import { targetOf } from '#src/recap/domain/compaction.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Agents, AgentState, PromptWait, Prompted } from '#src/ports/agents.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { oneTask } from './support.ts';

const lane = (pane: string, agent: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent });
const LANES = [lane('w1:p1', 'claude'), lane('w1:p2', 'codex'), lane('w1:p3', 'gemini')];

interface Typed { readonly pane: string; readonly text: string; readonly wait?: PromptWait | undefined; readonly typed?: boolean }

/** A fleet of fake agents: what each reports, what was typed into it, and what happened around it. */
function fleet(statuses: Record<string, string>, blocked: readonly string[] = []): { agents: Agents; typed: Typed[]; toasts: string[]; events: string[] } {
    const typed: Typed[] = [];
    const toasts: string[] = [];
    const events: string[] = [];
    const agents: Agents = {
        status: (pane): Promise<AgentState> => Promise.resolve(statuses[pane] === undefined ? unknown({ why: 'not-found', what: pane }) : { kind: 'agent', agent: 'x', status: statuses[pane] as 'idle' }),
        prompt: (pane, text, wait): Promise<Prompted> => {
            events.push(`prompt ${pane}`);
            typed.push({ pane, text, wait });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        typeLine: (pane, line): Promise<Prompted> => {
            events.push(`type ${pane}`);
            typed.push({ pane, text: line, typed: true });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        askNote: () => Promise.resolve({ kind: 'done' }),
    };
    return { agents, typed, toasts, events };
}

function flow(world: ReturnType<typeof fleet>, setting = 'focused', focused: string | null = 'w1:p1'): Compaction {
    const recap = { ...blankRecap('w1:t1'), tasks: oneTask('x', { ...NO_SECTIONS, goal: 'Ship the cart rewrite', rules: ['Never push to main'] }, ['w1:p1', 'w1:p2']) };
    const deps: CompactionDeps = {
        agents: world.agents,
        notifier: { notify: (title, body) => { world.toasts.push(`${title} | ${body}`); return Promise.resolve({ kind: 'shown' }); } },
        records: { readRecap: () => recap },
        webs: { of: () => null },
        lanes: () => LANES,
        focused: () => Promise.resolve(focused),
        refresh: () => { world.events.push('refresh'); return Promise.resolve(); },
        target: () => targetOf(setting),
        messages: () => en,
        log: () => undefined,
    };
    return new Compaction(deps);
}

test('claude: the recap is refreshed first, then `/compact` with the guidance is typed once; a note comes first', async () => {
    const world = fleet({ 'w1:p1': 'idle', 'w1:p2': 'idle' });
    await flow(world).run({ tab: 'w1:t1', pane: null, note: 'the retry test' });
    assert.deepEqual(world.events, ['refresh', 'type w1:p1']);
    assert.equal(world.typed.length, 1, 'only the focused agent');
    const sent = world.typed[0];
    assert.ok(sent !== undefined);
    assert.ok(sent.text.startsWith('/compact When you summarize'));
    assert.equal(sent.typed, true, 'typed as the operator would, not pasted');
    assert.ok(!/[\r\n]/u.test(sent.text), 'one line');
    assert.ok(sent.text.includes('(1) Above all, keep: the retry test') && sent.text.includes('Never push to main'));
    assert.equal(sent.wait, undefined, 'claude is not waited for');
    assert.match(world.toasts.join('\n'), /Compacting claude/);
});

test('claude without a note: no trace of one', async () => {
    const world = fleet({ 'w1:p1': 'done' });
    await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
    assert.ok(!/above all/i.test(world.typed[0]?.text ?? ''));
});

test('codex: its own /compact, waited until idle, then the restore message — in that order', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    await flow(world, 'focused', 'w1:p2').run({ tab: 'w1:t1', pane: null, note: 'keep the schema' });
    assert.deepEqual(world.typed.map((each) => each.text.split('\n')[0]), ['/compact', 'We just compacted this conversation. This is where things stand:']);
    assert.deepEqual(world.typed[0]?.wait, { until: ['idle', 'done'], timeoutMs: 600_000 });
    assert.equal(world.typed[1]?.wait, undefined);
    assert.ok(world.typed[1]?.text.includes('keep the schema'));
});

test('a working agent is left alone and the operator is told; so is a blocked one', async () => {
    for (const status of ['working', 'blocked', 'unknown']) {
        const world = fleet({ 'w1:p1': status });
        await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
        assert.deepEqual(world.typed, [], status);
        assert.deepEqual(world.events, [], 'nothing was even refreshed');
        assert.match(world.toasts.join('\n'), new RegExp(`claude is ${status}: not compacted`));
    }
});

test('an agent that turns blocked between the check and the typing is told about, not forced', async () => {
    const world = fleet({ 'w1:p1': 'idle' }, ['w1:p1']);
    await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
    assert.match(world.toasts.at(-1) ?? '', /Could not compact claude: blocked/);
});

test('codex that cannot finish its /compact gets no restore message', async () => {
    const world = fleet({ 'w1:p2': 'idle' }, ['w1:p2']);
    await flow(world, 'focused', 'w1:p2').run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 1);
});

test('all and kinds: every compactable agent that is free; gemini is never offered', async () => {
    const world = fleet({ 'w1:p1': 'idle', 'w1:p2': 'working', 'w1:p3': 'idle' });
    await flow(world, 'all').run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.typed.map((each) => each.pane), ['w1:p1']);
    assert.match(world.toasts.join('\n'), /codex is working/);
    const kinds = fleet({ 'w1:p1': 'idle', 'w1:p2': 'idle' });
    await flow(kinds, 'codex').run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(kinds.typed.map((each) => each.pane), ['w1:p2', 'w1:p2']);
});

test('an agent named by its pane is the one compacted, whatever is focused; a pane that is no agent falls back to the focus; with no agent at all the operator is told', async () => {
    const world = fleet({ 'w1:p2': 'idle', 'w1:p1': 'idle' });
    await flow(world).run({ tab: 'w1:t1', pane: 'w1:p2', note: null });
    assert.equal(world.typed[0]?.pane, 'w1:p2');
    const column = fleet({ 'w1:p1': 'idle' });
    await flow(column).run({ tab: 'w1:t1', pane: 'w1:p9', note: null });
    assert.equal(column.typed[0]?.pane, 'w1:p1', 'the column\'s pane names no agent: the focused one is used');
    const none = fleet({});
    await flow(none, 'focused', 'w1:p3').run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(none.typed, []);
    assert.match(none.toasts.join('\n'), /No agent here can be compacted/);
});

test('target resolution: focused agent, else the only agent; never a guess among several', () => {
    const [claude, codex] = [lane('w1:p1', 'claude'), lane('w1:p2', 'codex')];
    const focusedSetting = targetOf('focused');
    assert.deepEqual(targetsOf([claude, codex], focusedSetting, { pane: null, focused: 'w1:p2' }).map((each) => String(each.pane)), ['w1:p2']);
    assert.deepEqual(targetsOf([claude, codex], focusedSetting, { pane: null, focused: 'w1:p9' }), []);
    assert.deepEqual(targetsOf([claude], focusedSetting, { pane: null, focused: 'w1:p9' }).map((each) => String(each.pane)), ['w1:p1']);
});
