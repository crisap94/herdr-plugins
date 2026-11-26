import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { countOf, duration, instant, must, parseCount, parseUsd, textOf } from '@stateforge-labs/session-ledger';
import type { DecisionDraft } from '@stateforge-labs/session-ledger';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { evalWorld, type EvalWorld } from '../support/eval-world.ts';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const USAGE = 'USAGE: tab-recap autocompact [--all]';
const STAMP = String.raw`\d\d-\d\d \d\d:\d\d`;

let world: EvalWorld;

before(() => {
    world = evalWorld({ judge: 'none' });
});

after(() => {
    world.close();
});

const decision = (over: Partial<DecisionDraft>): DecisionDraft => ({
    scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(Date.now() - MINUTE), mode: 'shadow', share: countOf(61), tokens: must(parseCount(610_000)), window: must(parseCount(1_000_000)), gate: 'ask', verdict: 'compact',
    askedVerdict: 'compact', answers: new Map(), coverage: null, decider: textOf('jev · jev-1.13.0'), costUsd: must(parseUsd(0.00003)), tookMs: duration(550), why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, ...over,
});

test('an option nobody knows is a usage error: exit 2, the option named, the usage line, nothing on stdout', { timeout: 30_000 }, async () => {
    const ran = await world.run(['autocompact', '--nope']);
    assert.equal(ran.code, 2);
    assert.match(ran.stderr, /^tab-recap: 2 — .*--nope/);
    assert.ok(ran.stderr.includes(USAGE));
    assert.equal(ran.stdout, '');
});

test('a positional argument is a usage error that names it', { timeout: 30_000 }, async () => {
    const ran = await world.run(['autocompact', 'w1:t1']);
    assert.equal(ran.code, 2);
    assert.match(ran.stderr, /^tab-recap: 2 — unexpected w1:t1\n/);
    assert.ok(ran.stderr.includes(USAGE));
    assert.equal(ran.stdout, '');
});

test('on an empty store it prints the style line, a blank line, that there are no decisions and a zero total, and exits 0', { timeout: 30_000 }, async () => {
    const ran = await world.run(['autocompact']);
    assert.equal(ran.code, 0, ran.stderr);
    const lines = ran.stdout.split('\n');
    assert.match(lines[0] ?? '', /^style balanced · warnings at most \d\.\d\d · closes at least \d\.\d\d · undecided \d\.\d\d–\d\.\d\d · pass mark \d\.\d\d · ceiling \d+ % · /);
    assert.deepEqual(lines.slice(1), ['', 'no autocompact decisions yet', 'last 24 h: 0 decisions, $0', '']);
    assert.equal(ran.stderr, '');
});

test('--all is an option too: the same empty listing', { timeout: 30_000 }, async () => {
    const plain = await world.run(['autocompact']);
    const all = await world.run(['autocompact', '--all']);
    assert.equal(all.code, 0, all.stderr);
    assert.equal(all.stdout, plain.stdout);
});

test('decisions are listed newest first with the status each had, the share, the verdict, the gate, the decider and the cost, then the last day\'s total', { timeout: 30_000 }, async () => {
    world.withStore((store) => {
        store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run('w1:t1');
        store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run('w2:t9');
        store.decisions.record(decision({ at: instant(Date.now() - 2 * HOUR), scope: tabId('w2:t9'), key: paneId('w2:p3'), share: countOf(85), gate: 'ceiling', decider: null, costUsd: must(parseUsd(0)), laneStatus: null, mode: 'on' }));
        store.decisions.record(decision({ laneStatus: 'done' }));
        store.decisions.record(decision({ at: instant(Date.now() - 3 * DAY), key: paneId('w1:p5'), laneStatus: 'idle' }));
    });
    const ran = await world.run(['autocompact']);
    assert.equal(ran.code, 0, ran.stderr);
    const lines = ran.stdout.split('\n');
    assert.match(lines[2] ?? '', /^time\s+tab\s+pane\s+status\s+share\s+verdict\s+gate\s+decider\s+cost$/);
    assert.match(lines[3] ?? '', new RegExp(`^${STAMP}  w1:t1  w1:p1  done    61 %   compact  ask      jev · jev-1\\.13\\.0  \\$0\\.00003$`));
    assert.match(lines[4] ?? '', new RegExp(`^${STAMP}  w2:t9  w2:p3  —       85 %   compact  ceiling  —                 \\$0$`));
    assert.match(lines[5] ?? '', new RegExp(`^${STAMP}  w1:t1  w1:p5  idle    61 %`));
    assert.deepEqual(lines.slice(6), ['', 'last 24 h: 2 decisions, $0.00003', '']);
});

test('a decision whose brief check changed the verdict shows both: the effective one and the asked one', { timeout: 30_000 }, async () => {
    world.withStore((store) => {
        store.decisions.record(decision({ at: instant(Date.now() - 30 * MINUTE), key: paneId('w1:p7'), verdict: 'wait', gate: 'coverage', askedVerdict: 'compact', laneStatus: 'idle' }));
    });
    const ran = await world.run(['autocompact']);
    assert.match(ran.stdout, /w1:p7\s+idle\s+61 %\s+wait \(asked compact\)\s+coverage/);
});

test('the lanes not decided now follow the decisions, newest first, with their gate and detail; a share not known is a dash', { timeout: 30_000 }, async () => {
    world.withStore((store) => {
        store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run('w2:t2');
        store.decisions.skip({ scope: tabId('w1:t1'), key: paneId('w1:p9'), agent: agentKind('claude'), at: instant(Date.now() - MINUTE), gate: 'in-flight', share: countOf(62), detail: textOf('2 running') });
        store.decisions.skip({ scope: tabId('w2:t2'), key: paneId('w2:p1'), agent: agentKind('claude'), at: instant(Date.now() - 2 * MINUTE), gate: 'no-context', share: null, detail: textOf('the context share is not known yet') });
    });
    const ran = await world.run(['autocompact']);
    const lines = ran.stdout.split('\n');
    const from = lines.indexOf('not decided now');
    assert.ok(from > 0, 'the section is listed after the decisions');
    assert.match(lines[from + 1] ?? '', /^time\s+tab\s+pane\s+share\s+gate\s+detail$/);
    assert.match(lines[from + 2] ?? '', new RegExp(`^${STAMP}  w1:t1  w1:p9  62 %   in-flight   2 running$`));
    assert.match(lines[from + 3] ?? '', new RegExp(`^${STAMP}  w2:t2  w2:p1  —      no-context  the context share is not known yet$`));
    assert.match(lines[from - 2] ?? '', /^last 24 h: 3 decisions, \$0\.00006$/);
});
