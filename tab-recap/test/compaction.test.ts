import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { targetsOf } from '#src/recap/application/compaction-targets.ts';
import { targetOf } from '#src/recap/domain/compaction.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Mark } from '#src/ports/transcripts.ts';
import type { Agents, AgentState, PromptWait, Prompted } from '#src/ports/agents.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import { memoryStore } from './db/support.ts';
import { oneTask } from './support.ts';

const lane = (pane: string, agent: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent });
const LANES = [lane('w1:p1', 'claude'), lane('w1:p2', 'codex'), lane('w1:p3', 'gemini')];

interface Typed { readonly pane: string; readonly text: string; readonly pieces?: readonly string[]; readonly wait?: PromptWait | undefined; readonly typed?: boolean }

/** A fleet of fake agents: what each reports, what was typed into it, and what happened around it. */
function fleet(statuses: Record<string, string>, blocked: readonly string[] = []): { agents: Agents; typed: Typed[]; toasts: string[]; events: string[]; store: ReturnType<typeof memoryStore>; settling: LaneSettling; settledAfter: string[]; laneEvents: string[]; answered: string[]; lease: { acquire: (pane: string) => Promise<'taken' | 'busy' | 'unavailable'>; release: (pane: string) => Promise<void> } | undefined } {
    const typed: Typed[] = [];
    const toasts: string[] = [];
    const events: string[] = [];
    const settledAfter: string[] = [];
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const settling: LaneSettling = { settled: (pane) => { settledAfter.push(`${pane}: after ${events.join(',')}`); return Promise.resolve({ kind: 'settled', status: 'done' }); } };
    const agents: Agents = {
        status: (pane): Promise<AgentState> => Promise.resolve(statuses[pane] === undefined ? unknown({ why: 'not-found', what: pane }) : { kind: 'agent', agent: 'x', status: statuses[pane] as 'idle' }),
        prompt: (pane, text, wait): Promise<Prompted> => {
            events.push(`prompt ${pane}`);
            typed.push({ pane, text, wait });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        typeLine: (pane, pieces): Promise<Prompted> => {
            events.push(`type ${pane}`);
            typed.push({ pane, text: pieces.join(''), pieces, typed: true });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        askNote: () => Promise.resolve({ kind: 'done' }),
    };
    return { agents, typed, toasts, events, store, settling, settledAfter, laneEvents: [], lease: undefined, answered: [] };
}

interface Briefing { readonly documents: string[]; readonly answer: string | null; /** where the agent's session last broke, when it did */ readonly lastBreak?: number; /** an automatic compaction's coverage check keeps every fact */ readonly covered?: boolean }

const NOW = Date.parse('2026-10-07T10:00:00Z');
const compacted: Mark = { kind: 'compacted', at: NOW + 5000 };
const failed: Mark = { kind: 'compaction-failed', at: NOW + 5000 };

/** `reads`: what the agent's own records show each time they are looked at; the last one repeats. */
function flow(world: ReturnType<typeof fleet>, setting = 'focused', focused: string | null = 'w1:p1', briefing: Briefing | null = null, reads: readonly (readonly Mark[])[] = [[]]): Compaction {
    let looked = 0;
    const store = world.store;
    const recap = { ...blankRecap('w1:t1'), tasks: oneTask('x', { ...NO_SECTIONS, goal: 'Ship the cart rewrite', decisions: ['The recap column shows three lines'], rules: ['Never push to main'] }, ['w1:p1', 'w1:p2']) };
    const deps: CompactionDeps = {
        agents: world.agents,
        notifier: { notify: (title, body) => { world.toasts.push(`${title} | ${body}`); return Promise.resolve({ kind: 'shown' }); } },
        records: { readRecap: () => recap },
        ledger: { historyOf: () => [{ section: 'decisions', text: 'Keep SQLite', why: 'one file', state: 'open', closedWhy: null, closedAt: null, firstAt: 1, lastAt: 2 }, { section: 'decisions', text: 'Use JSON files', why: 'simple', state: 'closed', closedWhy: 'superseded', closedAt: 2, firstAt: 1, lastAt: 2 }] },
        boundaries: { lastBreakAt: () => briefing?.lastBreak ?? null },
        compactions: store.compactions,
        settling: world.settling,
        brief: {
            enabled: () => briefing !== null,
            job: () => (briefing === null ? null : 'codex · gpt-6-luna · high'),
            write: (document) => { world.events.push('brief'); briefing?.documents.push(document); return Promise.resolve({ text: briefing?.answer ?? null, why: briefing?.answer === null ? 'the answer is empty' : null }); },
        },
        recent: () => Promise.resolve([{ role: 'user', text: 'run the tests' }]),
        now: () => NOW,
        marks: () => { const shown = reads[Math.min(looked, reads.length - 1)] ?? []; looked += 1; return Promise.resolve(shown); },
        pause: () => Promise.resolve(),
        webs: { of: () => null },
        lanes: () => LANES,
        focused: () => Promise.resolve(focused),
        refresh: () => { world.events.push('refresh'); return Promise.resolve(); },
        // an automatic compaction waits without a coverage check; `covered` gives one that keeps every fact
        coverage: () => (briefing?.covered === true ? { check: () => Promise.resolve({ ok: true, missing: [], answers: {}, unknown: null }) } : null),
        decisions: null,
        target: () => targetOf(setting),
        messages: () => en,
        log: () => undefined,
        ...(world.lease === undefined ? {} : { typing: world.lease }),
        claims: new CompactionClaims(),
        answer: (id, pane, stage) => { world.answered.push(`${id} ${pane} ${stage}`); },
        events: { lane: (pane, kind, detail) => { world.laneEvents.push(`${pane} ${kind}${detail === undefined || detail === null ? '' : ` ${detail}`}`); }, inWorkspace: () => undefined },
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
    assert.equal(sent.pieces?.[0], '/compact ', '`/compact ` is typed first, the guidance second');
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

test('codex: its own /compact typed with Enter (a prompt reaches it as a message), then the restore message — in that order', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    await flow(world, 'focused', 'w1:p2').run({ tab: 'w1:t1', pane: null, note: 'keep the schema' });
    assert.deepEqual(world.typed.map((each) => each.text.split('\n')[0]), ['/compact', 'We just compacted this conversation. This is where things stand:']);
    assert.deepEqual([world.typed[0]?.typed, world.typed[0]?.pieces], [true, ['/compact']], 'typed as a command, in one piece');
    assert.ok(world.typed[1]?.text.includes('keep the schema'));
    assert.equal(world.typed[1]?.wait, undefined, 'the restore message is typed without a wait: the wait follows, outside the lease');
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


test('with a brief: claude gets `/compact ` then the brief as typed pieces; the document holds the history, the note and the recent turns; the operator is told it is being written', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    const briefing = { documents: [] as string[], answer: 'I want the cart rewrite shipped. We kept SQLite because it needs no server.' };
    await flow(world, 'focused', 'w1:p1', briefing).run({ tab: 'w1:t1', pane: null, note: 'the retry test' });
    assert.deepEqual(world.events, ['refresh', 'brief', 'type w1:p1']);
    assert.deepEqual(world.typed[0]?.pieces, ['/compact ', briefing.answer]);
    const [document] = briefing.documents;
    assert.ok(document?.includes('Keep SQLite') && document.includes('the retry test') && document.includes('run the tests'));
    assert.match(world.toasts.join('\n'), /Writing what claude should keep/);
});

const documentFor = async (lastBreak?: number): Promise<string> => {
    const briefing: Briefing = { documents: [], answer: 'We kept SQLite.', ...(lastBreak === undefined ? {} : { lastBreak }) };
    await flow(fleet({ 'w1:p1': 'idle' }), 'focused', 'w1:p1', briefing).run({ tab: 'w1:t1', pane: null, note: null });
    return briefing.documents[0] ?? '';
};

test('with a brief: a decision closed before the lane\'s last break goes in as settled; an open one and one closed after it do not; with no break nothing is settled', async () => {
    assert.match(await documentFor(5), /<item section="decisions" state="closed" first="[^"]+" last="[^"]+" why="simple" closed="superseded" settled="yes">Use JSON files<\/item>/);
    assert.equal((await documentFor(5)).match(/settled="yes"/g)?.length, 1, 'the open decision is not settled');
    assert.ok(!(await documentFor(2)).includes('settled='), 'closed at the break itself: not settled');
    assert.ok(!(await documentFor()).includes('settled='));
});

test('with a brief: codex is compacted, then told where things stand with the brief inside', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    const briefing = { documents: [] as string[], answer: 'We kept SQLite.' };
    await flow(world, 'focused', 'w1:p2', briefing).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed[1]?.text, 'We just compacted this conversation. This is where things stand: We kept SQLite. Nothing needs doing yet: just answer "ok".');
});

test('no brief written (the job is on but nothing came): the template is used and compaction still happens', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', { documents: [], answer: null }).run({ tab: 'w1:t1', pane: null, note: null });
    assert.ok(world.typed[0]?.text.startsWith('/compact When you summarize'));
});

test('claude: a compaction its records confirm is announced with the numbers they gave; the guidance is typed once', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[{ ...compacted, tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588 }]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 1);
    assert.equal(world.toasts.at(-1), 'Compact claude | claude compacted: 39.5k → 3.1k tokens in 16 s');
    assert.equal(world.toasts.length, 2, 'two toasts: when it starts, when it ends');
});

test('claude: its own summarizer failing is retried once with the same guidance, and the second try is announced', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[failed], [failed, compacted]]).run({ tab: 'w1:t1', pane: null, note: 'keep it' });
    assert.equal(world.typed.length, 2);
    assert.deepEqual(world.typed[1]?.pieces, world.typed[0]?.pieces, 'the same guidance');
    assert.match(world.toasts.at(-1) ?? '', /claude compacted \(on the second try\)/);
    assert.equal(world.toasts.filter((toast) => toast.includes('Compacting claude')).length, 1, 'announced once');
});

test('claude: failing twice is said, and not tried a third time', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[failed]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 2);
    assert.match(world.toasts.at(-1) ?? '', /could not compact, even after trying again/);
});

test('nothing in the records either way: not retried, and the operator is told it is not confirmed; marks from before the command do not count', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[{ kind: 'compaction-failed', at: NOW - 60_000 }, { kind: 'compacted', at: null }]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 1);
    assert.match(world.toasts.at(-1) ?? '', /could not confirm the compaction/);
});

test('codex: a confirmed compaction is followed by the restore message and announced', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    await flow(world, 'focused', 'w1:p2', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 2);
    assert.match(world.toasts.at(-1) ?? '', /codex compacted in 0 s$/, 'no numbers in the records: none are guessed, the time is the stage time');
});

test('the outcome is awaited on herdr\'s push for the lane, after the command is typed; codex waits inside its own prompt, then for the restore turn\'s own pushes', async () => {
    const world = fleet({ 'w1:p1': 'idle', 'w1:p2': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.settledAfter, ['w1:p1: after refresh,type w1:p1']);
    const codex = fleet({ 'w1:p2': 'idle' });
    await flow(codex, 'focused', 'w1:p2', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    const afterRestore = 'w1:p2: after refresh,type w1:p2,prompt w1:p2';
    assert.deepEqual(codex.settledAfter, [afterRestore, afterRestore], 'both waits follow the restore message: its answer\'s working → done must not pass for the operator\'s next turn');
});

const records = (world: ReturnType<typeof fleet>): ReturnType<typeof world.store.compactions.shownFor> => world.store.compactions.shownFor('w1:t1');

test('the record: a claude compaction with a written brief walks briefing → compacting → compacted and keeps what each step knew', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    const seen: string[] = [];
    const briefing = { documents: [] as string[], answer: 'We kept SQLite.' };
    const looking: Agents = { ...world.agents, typeLine: (pane, pieces) => { seen.push(`typing: ${records(world)[0]?.stage}`); return world.agents.typeLine(pane, pieces); } };
    const flowing = flow({ ...world, agents: looking }, 'focused', 'w1:p1', { ...briefing, get answer() { seen.push(`writing: ${records(world)[0]?.stage}`); return briefing.answer; } }, [[{ ...compacted, tokensBefore: 900, tokensAfter: 100, tookMs: 4000 }]]);
    await flowing.run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual([...new Set(seen)], ['writing: briefing', 'typing: compacting']);
    assert.deepEqual(records(world).map((r) => [r.stage, r.agent, r.pane, r.brief, r.writer, r.templateWhy, r.tokensBefore, r.tokensAfter, r.tookMs, r.retried, r.finishedAt === NOW]), [['compacted', 'claude', 'w1:p1', 'written', 'codex · gpt-6-luna · high', null, 900, 100, 4000, false, true]]);
});

test('the record: the template says why it was used; with no brief job it is a template with no reason; a retry is recorded', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', { documents: [], answer: null }, [[failed], [failed, compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(world).map((r) => [r.stage, r.brief, r.templateWhy, r.retried]), [['compacted', 'template', 'the answer is empty', true]]);
    const plain = fleet({ 'w1:p1': 'idle' });
    await flow(plain, 'focused', 'w1:p1', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(plain).map((r) => [r.brief, r.writer, r.templateWhy]), [['template', null, null]]);
});

test('the record: codex passes through restoring; the end comes after the restore message was answered', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    const seen: string[] = [];
    const looking: Agents = {
        ...world.agents,
        typeLine: (pane, pieces) => { seen.push(`${pieces.join('').slice(0, 12)}: ${records(world)[0]?.stage}`); return world.agents.typeLine(pane, pieces); },
        prompt: (pane, text, wait) => { seen.push(`${text.split('\n')[0]?.slice(0, 12)}: ${records(world)[0]?.stage}`); return world.agents.prompt(pane, text, wait); },
    };
    await flow({ ...world, agents: looking }, 'focused', 'w1:p2', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(seen, ['/compact: compacting', 'We just comp: restoring']);
    assert.equal(records(world)[0]?.stage, 'compacted');
});

test('the record: busy is skipped, with the reason; a refused typing is failed, with the reason', async () => {
    const busy = fleet({ 'w1:p1': 'working' });
    await flow(busy).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(busy).map((r) => [r.stage, r.why, r.finishedAt]), [['skipped', 'working', NOW]]);
    const refused = fleet({ 'w1:p1': 'idle' }, ['w1:p1']);
    await flow(refused).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(refused).map((r) => [r.stage, r.why]), [['failed', en.badge.blocked]]);
});

test('the record: failing twice is failed (with the reason), nothing in the records is unconfirmed', async () => {
    const twice = fleet({ 'w1:p1': 'idle' });
    await flow(twice, 'focused', 'w1:p1', null, [[failed]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(twice).map((r) => [r.stage, r.retried, r.why]), [['failed', true, 'its own summary failed, twice']]);
    const unsure = fleet({ 'w1:p1': 'idle' });
    await flow(unsure).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(records(unsure).map((r) => [r.stage, r.why]), [['unconfirmed', null]]);
});

test('the record: an agent that turns busy while the brief is written is skipped, and nothing is typed', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    const asked: string[] = [];
    const agents: Agents = { ...world.agents, status: () => { asked.push('status'); return Promise.resolve({ kind: 'agent', agent: 'claude', status: asked.length > 1 ? 'working' : 'idle' }); } };
    await flow({ ...world, agents }, 'focused', 'w1:p1', { documents: [], answer: 'We kept SQLite.' }).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.typed, []);
    assert.deepEqual(records(world).map((r) => [r.stage, r.why]), [['skipped', 'working']]);
    assert.match(world.toasts.at(-1) ?? '', /claude is working: not compacted/);
});

test('the toasts are two: Writing what claude should keep… and the end with the numbers; a skip is one', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', { documents: [], answer: 'We kept SQLite.' }, [[{ ...compacted, tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588 }]]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.toasts, ['Compact claude | Writing what claude should keep…', 'Compact claude | claude compacted: 39.5k → 3.1k tokens in 16 s']);
    const busy = fleet({ 'w1:p1': 'working' });
    await flow(busy).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(busy.toasts.length, 1);
});

test('the template leaves out recap items that name the plugin, unless the conversation itself does', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
    assert.ok(world.typed[0]?.text.includes('Ship the cart rewrite'));
    assert.ok(!/recap|\btab\b/iu.test(world.typed[0]?.text ?? ''), world.typed[0]?.text);
});

test('the typing lease: taken around the brief and cleared after it is typed; an earlier foreign lease that does not go means nothing is typed', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    const calls: string[] = [];
    world.lease = { acquire: (pane: string): Promise<'taken' | 'busy' | 'unavailable'> => { calls.push(`acquire ${pane}`); return Promise.resolve('taken'); }, release: (pane: string): Promise<void> => { calls.push(`release ${pane}`); return Promise.resolve(); } };
    await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(calls, ['acquire w1:p1', 'release w1:p1'], 'taken before the line is typed, cleared after');
    assert.equal(world.typed.length, 1);
    const held = fleet({ 'w1:p1': 'idle' });
    held.lease = { acquire: (): Promise<'taken' | 'busy' | 'unavailable'> => Promise.resolve('busy'), release: (): Promise<void> => Promise.resolve() };
    await flow(held).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(held.typed, [], 'nothing typed while another tool holds the pane');
});

test('the stages of a compaction are events on the lane, its id as the detail: queued, running, done', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[compacted]]).run({ tab: 'w1:t1', pane: null, note: null });
    const id = /cmp_[0-9a-z]+/u;
    assert.deepEqual(world.laneEvents.map((line) => line.replace(id, 'ID')), ['w1:p1 compact-queued ID', 'w1:p1 compact-running ID', 'w1:p1 compact-done ID']);
});

test('a request from another tool is answered on its pane as the compaction goes: running, then done', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    await flow(world, 'focused', 'w1:p1', null, [[compacted]]).run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r7' });
    assert.deepEqual(world.answered, ['r7 w1:p1 running', 'r7 w1:p1 done']);
});

test('the restore message is typed under the lease, and the wait for the agent to answer is outside it', async () => {
    const world = fleet({ 'w1:p2': 'idle' });
    world.lease = {
        acquire: (pane: string): Promise<'taken' | 'busy' | 'unavailable'> => { world.events.push(`acquire ${pane}`); return Promise.resolve('taken'); },
        release: (pane: string): Promise<void> => { world.events.push(`release ${pane}`); return Promise.resolve(); },
    };
    await flow(world, 'focused', 'w1:p2', null, [[compacted]]).run({ tab: 'w1:t1', pane: 'w1:p2', note: null });
    const leased = world.events.filter((line) => /^(acquire|release|type|prompt) /u.test(line));
    assert.deepEqual(leased, ['acquire w1:p2', 'type w1:p2', 'release w1:p2', 'acquire w1:p2', 'prompt w1:p2', 'release w1:p2'], 'each line typed under its own lease');
    assert.ok(world.settledAfter.some((line) => line.includes('prompt w1:p2')), 'the wait for the answer starts after the restore was typed');
});

test('herdr cannot take the lease: the brief is typed all the same', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    world.lease = { acquire: (): Promise<'taken' | 'busy' | 'unavailable'> => Promise.resolve('unavailable'), release: (): Promise<void> => Promise.resolve() };
    await flow(world).run({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(world.typed.length, 1, 'typed without a lease');
});

// The live bug (2.3.0, 01:46:12): a token request and an automatic compaction of one pane started in the same second. Both passed the
// status check before either wrote a record, so both typed `/compact` and the requested one ended unconfirmed.
test('one compaction per lane: a request and an automatic one at the same instant start one compaction; the second joins it', async () => {
    const world = fleet({ 'w1:p1': 'idle' });
    // an automatic compaction needs a written brief and a coverage check before it types (a template waits)
    const compaction = flow(world, 'focused', 'w1:p1', { documents: [], answer: 'Keep the schema.', covered: true }, [[compacted]]);
    await Promise.all([
        compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }),
        compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r1' }),
    ]);
    assert.equal(world.typed.length, 1, 'one /compact typed');
    assert.equal(records(world).length, 1, 'one compaction record');
    assert.deepEqual(world.answered, ['r1 w1:p1 queued', 'r1 w1:p1 running', 'r1 w1:p1 done'], 'the joined request follows the running compaction');
    assert.match(world.toasts.join('\n'), /already compacting/);
});

test('a request that joins a compaction the agent refuses is answered with that refusal', async () => {
    const world = fleet({ 'w1:p1': 'working' });
    const compaction = flow(world);
    await Promise.all([
        compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }),
        compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r1' }),
    ]);
    assert.deepEqual(world.typed, [], 'nothing typed into a working agent');
    assert.deepEqual([world.answered[0], world.answered.at(-1)?.startsWith('r1 w1:p1 failed-')], ['r1 w1:p1 queued', true]);
});
