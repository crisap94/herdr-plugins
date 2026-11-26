import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { capabilityWording, countOf, instant, must, parseCount, parseDirectory, parseMilliseconds, parseText, parseUsd, sourcePathOf, textOf, TranscriptRegistry } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader, SessionCursor } from '@stateforge-labs/session-ledger';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { EditCache, EditTally } from '#src/recap/application/edit-tally.ts';
import { TRANSCRIPT_READ_BUDGET_BYTES } from '#src/recap/application/transcript-read-budget.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { agentKind } from '#test/support/ids.ts';
import { recordedPath } from '../support/source-world.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { paneId } from '#test/support/ids.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { viewWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { HOUR, MIN, NOW, recordCompactions, sections, showAlert, showRecap, VERSION } from '../support/view-seeds.ts';
import { cursor, recordOps } from '#test/db/support.ts';
import { tabId } from '#test/support/ids.ts';
import { usdOf } from '@stateforge-labs/session-ledger';

const until = async (done: () => boolean, what: string): Promise<void> => {
    for (let waited = 0; waited < 10_000 && !done(); waited += 20) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    }
    assert.ok(done(), what);
};

const ROOT = must(parseDirectory('/w/repo'));
const LANES = [
    { pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: '/w/repo' },
    { pane: 'w1:p2', agent: 'codex', status: 'idle', title: 'codex', cwd: '/w/repo' },
] as const;

const status = (ahead: number, tracked: number, untracked: number | null): WorktreeStatus => ({
    root: ROOT, branch: must(parseText('main')), ahead: countOf(ahead), tracked: must(parseCount(tracked)), untracked: untracked === null ? null : must(parseCount(untracked)), at: instant(NOW),
});

const SESSIONS = LANES.map((lane) => ({ pane: lane.pane, agent: lane.agent, title: lane.title, lastPrompt: null }));

function seed(world: ViewWorld): void {
    world.store.views.writeTab(viewRecord({ tab: 'w1:t1', column: 'w1:p9', at: NOW, daemonVersion: VERSION, lanes: LANES }));
    showRecap(world, { at: NOW - 3 * MIN, sections: sections({ goal: 'Ship the uploader' }), lanes: SESSIONS });
}

const joined = (pane: Pane): string => (pane.screen()?.plain ?? []).join(' ').replaceAll(/\s+/gu, ' ');

const lineAfter = (pane: Pane, heading: RegExp): string => {
    const lines = pane.screen()?.plain ?? [];
    const at = lines.findIndex((line) => heading.test(line));
    return at < 0 ? '' : lines.slice(at + 1, at + 4).join('\n');
};

describe('a note stored for a lane shows under the lane', () => {
    let world: ViewWorld;
    let pane: Pane;

    const repaint = async (what: string, ready: (text: string) => boolean): Promise<string> => {
        world.refresh();
        return (await pane.painted((screen) => ready(screen.text), what)).text;
    };

    before(async () => {
        world = await viewWorld({ now: NOW, version: VERSION });
        seed(world);
        world.store.worktrees.write(status(1, 2, 0));
        world.store.worktrees.bind(paneId('w1:p1'), ROOT);
        world.store.worktrees.bind(paneId('w1:p2'), ROOT);
        world.store.paneNotes.replace(paneId('w1:p1'), [{ label: textOf('note'), value: textOf('hold') }]);
        pane = await world.pane({ cols: 70, rows: 40, role: 'column' });
        await pane.painted((screen) => screen.text.includes('Ship the uploader'), 'the column shows the recap');
    });

    after(async () => {
        await pane.close();
        await world.close();
    });

    test('the git note and the pane note are under their lane, git first', { timeout: 30_000 }, async () => {
        const shown = await repaint('the git note and the note', (text) => text.includes('⎇ main') && text.includes('⚑ note'));
        assert.match(shown, /⎇ main · 1 unpushed · 2 changed/);
        assert.match(shown, /⚑ note · hold/);
        assert.ok(shown.indexOf('⎇ main') < shown.indexOf('⚑ note'));
    });

    test('two lanes in one worktree share its one status', { timeout: 30_000 }, () => {
        const shown = pane.screen()?.plain ?? [];
        assert.equal(shown.filter((line) => line.includes('⎇ main')).length, 2);
        assert.equal(shown.filter((line) => line.includes('⚑ note')).length, 1, 'only the lane that holds the note shows it');
    });

    test('an alert a source raised is drawn first, with its own details', { timeout: 30_000 }, async () => {
        showAlert(world, 'w1:p1', 'unmerged', NOW - 2 * MIN, ['feat/x', '3 unmerged']);
        const shown = await repaint('the alert', (text) => text.includes('⚑ unmerged'));
        assert.match(shown, /⚑ unmerged 2m ago · feat\/x · 3 unmerged/);
        assert.ok(shown.indexOf('⚑ unmerged') < shown.indexOf('⎇ main') && shown.indexOf('⎇ main') < shown.indexOf('⚑ note'));
    });

    test('the next alert of the same source replaces the first', { timeout: 30_000 }, async () => {
        showAlert(world, 'w1:p1', 'stale', NOW - MIN, ['feat/y']);
        const shown = await repaint('the second alert', (text) => text.includes('⚑ stale') && !text.includes('⚑ unmerged'));
        assert.ok(!shown.includes('3 unmerged'));
    });

    test('a note set replaces the one before it as a whole', { timeout: 30_000 }, async () => {
        world.store.paneNotes.replace(paneId('w1:p1'), [{ label: textOf('review'), value: textOf('waiting') }]);
        const shown = await repaint('the new note set', (text) => text.includes('⚑ review · waiting') && !text.includes('⚑ note'));
        assert.ok(!shown.includes('hold'));
    });

    test('the status moves in place when the worktree is read again', { timeout: 30_000 }, async () => {
        world.store.worktrees.write(status(0, 0, null));
        const shown = await repaint('the clean worktree', (text) => !text.includes('unpushed'));
        assert.match(lineAfter(pane, /orchestrator/), /⎇ main\b/);
        assert.ok(!shown.includes('changed'));
    });

    test('a lane that leaves its worktree has no git note, the other lane keeps it', { timeout: 30_000 }, async () => {
        world.store.worktrees.bind(paneId('w1:p1'), null);
        await repaint('one git note left', (text) => (text.match(/⎇ main/g) ?? []).length === 1);
        world.store.worktrees.drop(ROOT);
        const shown = await repaint('no git note', (text) => !text.includes('⎇ main'));
        assert.ok(shown.includes('⚑ review · waiting'), 'the note stays when the worktree goes');
    });

    test('the same notes are drawn in Spanish', { timeout: 30_000 }, async () => {
        world.store.worktrees.write(status(2, 1, 2));
        world.store.worktrees.bind(paneId('w1:p1'), ROOT);
        world.setLocale('es');
        const spanish = await world.pane({ cols: 70, rows: 40, role: 'column' });
        try {
            const shown = (await spanish.painted((screen) => screen.text.includes('⎇ main'), 'the git note in Spanish')).text;
            assert.match(shown, /2 sin subir · 3 cambiados/);
        } finally {
            await spanish.close();
            world.setLocale('en');
        }
    });

    test('TAB_RECAP_GIT_NOTE=off hides the git note and keeps the notes', { timeout: 30_000 }, async () => {
        const was = process.env['TAB_RECAP_GIT_NOTE'];
        process.env['TAB_RECAP_GIT_NOTE'] = 'off';
        try {
            const shown = await repaint('the note without the git note', (text) => text.includes('⚑ review · waiting') && !text.includes('⎇'));
            assert.ok(!shown.includes('sin subir'));
            process.env['TAB_RECAP_GIT_NOTE'] = 'on';
            await repaint('the git note is back', (text) => text.includes('⎇ main'));
        } finally {
            if (was === undefined) {
                delete process.env['TAB_RECAP_GIT_NOTE'];
            } else {
                process.env['TAB_RECAP_GIT_NOTE'] = was;
            }
        }
    });
});

describe('the session facts of the expanded view come from the store alone', () => {
    let world: ViewWorld;

    const modal = async (marker: string): Promise<Pane> => {
        const pane = await world.pane({ cols: 202, rows: 140, role: 'modal' });
        await pane.painted((screen) => screen.text.includes(marker), 'the expanded view paints');
        return pane;
    };

    before(async () => {
        world = await viewWorld({ now: NOW, version: VERSION });
        world.store.views.writeTab(viewRecord({
            tab: 'w1:t1', column: 'w1:p9', at: NOW, daemonVersion: VERSION,
            lanes: [
                { pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: null, context: { tokens: countOf(340_000), window: countOf(1_000_000), source: 'table' }, web: { base: 'https://git.example/group/herdr-plugins', forge: 'gitlab', branch: 'feat/expanded' } },
                { pane: 'w1:p2', agent: 'codex', status: 'idle', title: null, cwd: null, context: { tokens: countOf(32_640), window: countOf(272_000), source: 'agent' } },
                { pane: 'w1:p3', agent: 'opencode', status: 'idle', title: 'x', cwd: null, context: null },
            ],
        }));
        showRecap(world, { at: NOW - 3 * MIN, sections: sections({ goal: 'Ship it' }) });
        for (const [at, cause] of [[NOW - 50 * MIN, 'turn-ended'], [NOW - 40 * MIN, 'turn-ended'], [NOW - 30 * MIN, 'focused']] as const) {
            recordOps(world.store, { scope: tabId('w1:t1'), at: instant(at), cause, backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneId('w1:p1')] }], ops: [] });
        }
        recordCompactions(world, [{ at: NOW - 3 * HOUR, before: 800_000, after: 14_000, origin: 'operator' }, { at: NOW - 2 * HOUR, before: 600_000, after: 9_000, origin: 'auto' }]);
    });

    after(async () => {
        await world.close();
    });

    test('the turns by cause, the compactions by origin, and each agent\'s context share are listed', { timeout: 30_000 }, async () => {
        const pane = await modal('SESSION');
        try {
            const shown = joined(pane);
            assert.match(shown, /turns 3 \(turn 2 · focus 1\)/);
            assert.match(shown, /compactions 2 \(1 by you · 1 auto\) \(800k → 14k · 600k → 9k\)/);
            assert.match(shown, /claude · orchestrator 34 % of 1M/);
            assert.match(shown, /codex 12 % of 272k/);
            assert.ok(!shown.includes('opencode'), 'an agent whose context is unknown has no line');
        } finally {
            await pane.close();
        }
    });

    test('the repository and branch come from the lane that knows them, and the tab says when it started', { timeout: 30_000 }, async () => {
        const pane = await modal('SESSION');
        try {
            assert.match(joined(pane), /repo herdr-plugins · branch feat\/expanded/);
            assert.match(joined(pane), /started \d\d:\d\d · /);
        } finally {
            await pane.close();
        }
    });

    test('the autocompact line counts the decisions and the waits once the tab has any', { timeout: 30_000 }, async () => {
        const pane = await modal('SESSION');
        try {
            assert.ok(!joined(pane).includes('autocompact'), 'a tab with no decision has no line');
        } finally {
            await pane.close();
        }
        const draft = { scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - HOUR), mode: 'shadow' as const, share: countOf(61), tokens: must(parseCount(610_000)), window: must(parseCount(1_000_000)), gate: 'ask' as const, verdict: 'wait' as const, askedVerdict: 'wait' as const, answers: new Map(), coverage: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null };
        world.store.decisions.record(draft);
        world.store.decisions.record({ ...draft, at: instant(NOW - HOUR + 1) });
        const counted = await modal('SESSION');
        try {
            assert.match(joined(counted), /autocompact 2 decisions · 0 compacted · 2 waited/);
        } finally {
            await counted.close();
        }
    });

    test('the same facts are drawn in Spanish', { timeout: 30_000 }, async () => {
        world.setLocale('es');
        const pane = await modal('SESIÓN');
        try {
            const shown = joined(pane);
            assert.match(shown, /turnos 3 \(turno 2 · foco 1\)/);
            assert.match(shown, /compactaciones 2 \(1 por ti · 1 auto\)/);
            assert.match(shown, /claude · orchestrator 34 % de 1M/);
        } finally {
            await pane.close();
            world.setLocale('en');
        }
    });
});

describe('the files a session edited are counted through each lane\'s own reader', () => {
    const SESSION = recordedPath('claude-session.jsonl');
    const lane = (pane: string, over: Partial<SessionCursor> = {}): SessionCursor => ({ ...cursor(pane), transcript: sourcePathOf(SESSION), ...over });
    const budgets: number[] = [];
    const claude = new ClaudeTranscripts(fsPathOf(dirname(SESSION)));
    const recording: LegacySessionReader = { agent: claude.agent, inFlight: claude.inFlight, locate: (...args) => claude.locate(...args), latestPrompt: (...args) => claude.latestPrompt(...args), read: (source, was, budget) => { budgets.push(budget); return claude.read(source, was, budget); } };
    const registry = new TranscriptRegistry(new Map([[claude.agent, recording]]), null, (kind) => capabilityWording('history-unavailable', must(parseText(kind))));

    test('the edit calls of the lanes are counted per path, the most edited first, ties by path; screens and unknown agents count nothing', { timeout: 30_000 }, async () => {
        const counts = await new EditTally(registry).of([lane('w1:p1'), lane('w1:p2'), lane('w1:p3', { transcript: sourcePathOf('screen:w1:p3') }), lane('w1:p4', { agent: agentKind('gemini') })]);
        assert.deepEqual(counts.map((one) => [one.path, one.count]), [['/repo/Edit.ts', 2], ['/repo/MultiEdit.ts', 2], ['/repo/NotebookEdit.ts', 2], ['/repo/Write.ts', 2]]);
    });

    test('each transcript is read with the one shared budget of 4 MiB', { timeout: 30_000 }, () => {
        assert.deepEqual([...new Set(budgets)], [4 * 1024 * 1024]);
        assert.equal(TRANSCRIPT_READ_BUDGET_BYTES, 4 * 1024 * 1024);
    });

    test('the cache answers at once with what it has and refreshes in the background once a minute', { timeout: 30_000 }, async () => {
        const seen = budgets.length;
        const cache = new EditCache(new EditTally(registry), must(parseMilliseconds(60_000)));
        assert.deepEqual(cache.of([lane('w1:p1')], instant(0)), [], 'the first look does not wait');
        await until(() => budgets.length > seen, 'the background read');
        await until(() => cache.of([lane('w1:p1')], instant(1000)).length === 4, 'the read is cached');
        assert.equal(budgets.length, seen + 1, 'not again within a minute');
        cache.of([lane('w1:p1')], instant(60_000));
        await until(() => budgets.length > seen + 1, 'the refresh after a minute');
    });
});
