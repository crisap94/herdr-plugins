import { textOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_SCREEN_CHROME, ScreenTranscripts, SCREEN_READER_ID } from '#src/adapters/transcripts/screen.ts';
import { loadSettings } from '#src/daemon/config.ts';
import { cleanScreen, screenEntries, steady } from '#src/recap/application/screen-text.ts';
import { DEFAULT_POLICY, screenKindsOf, screenSetting, wantsKind } from '#src/recap/domain/policy.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { UNREAD, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { Chunk } from '@stateforge-labs/session-ledger';
import type { ScreenOutcome, ScreenReader } from '#src/ports/screens.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { seenLane } from '#test/support/seen.ts';
import { seatOf } from '#src/recap/domain/lane.ts';

const SCREEN = [
    '● I fixed the parser and the tests pass now.',
    '',
    '  Ran 2 shell commands',
    '',
    '────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────',
    '  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt',
    '✻ Brewing… (12s · ↓ 1.2k tokens)',
].join('\n');

test('a screen is read without its chrome: borders, the empty prompt, key hints and spinners go; blank runs collapse', () => {
    assert.equal(cleanScreen(textOf(SCREEN), CLAUDE_SCREEN_CHROME), '● I fixed the parser and the tests pass now.\n\n  Ran 2 shell commands');
    assert.equal(cleanScreen(textOf('────\n❯ \n⏵⏵ bypass permissions on'), CLAUDE_SCREEN_CHROME), '');
    assert.deepEqual(screenEntries(textOf(SCREEN), CLAUDE_SCREEN_CHROME).map((entry) => entry.text), ['● I fixed the parser and the tests pass now.', '  Ran 2 shell commands']);
    assert.ok(screenEntries(textOf('x'.repeat(5000)), CLAUDE_SCREEN_CHROME).every((entry) => entry.text.length <= 2000), 'no entry outgrows the excerpt clip');
});

class FakeScreens implements ScreenReader {
    asked: { pane: SessionKey; lines: Count }[] = [];
    next: ScreenOutcome = { kind: 'screen', text: textOf(SCREEN), revision: countOf(7), truncated: 'absent' };
    readScreen(pane: SessionKey, lines: Count): Promise<ScreenOutcome> {
        this.asked.push({ pane, lines });
        return Promise.resolve(this.next);
    }
}

const lane = (agent: string): ReturnType<typeof laneFrom> => laneFrom(seenLane({ paneId: 'w1:p3', tabId: 'w1:t1', workspaceId: 'w1', agent }));

test('ScreenTranscripts: only for the kinds asked, one source per pane, the revision is the cursor and a hash of the clean text the tail', async () => {
    const screens = new FakeScreens();
    const reader = new ScreenTranscripts(screens, (agent) => (agent === 'gemini' ? 'present' : 'absent'));
    assert.equal(reader.agent, SCREEN_READER_ID);
    assert.equal((await reader.locate(seatOf(lane('qwen')))).kind, 'unknown');
    const located = await reader.locate(seatOf(lane('gemini')));
    assert.deepEqual(located, { kind: 'located', source: sourcePathOf('screen:w1:p3') });
    const first = await reader.read('screen:w1:p3', UNREAD, 10_000) as Chunk;
    assert.deepEqual(screens.asked, [{ pane: 'w1:p3', lines: 200 }]);
    assert.equal(first.grew, true);
    assert.equal(first.position.cursor, 7);
    assert.match(first.position.tail ?? '', /^[0-9a-f]{16}$/);
    assert.equal(first.entries.length, 2);
    screens.next = { kind: 'screen', text: textOf(`${SCREEN}\n`), revision: countOf(9), truncated: 'absent' };
    const repainted = await reader.read('screen:w1:p3', first.position, 10_000) as Chunk;
    assert.deepEqual([repainted.grew, repainted.entries.length, repainted.position.cursor, repainted.position.tail], [false, 0, 9, first.position.tail]);
    screens.next = { kind: 'screen', text: textOf(`${SCREEN}\n\n● Now the lint.`), revision: countOf(11), truncated: 'absent' };
    const changed = await reader.read('screen:w1:p3', repainted.position, 10_000) as Chunk;
    assert.equal(changed.grew, true);
});

test('ScreenTranscripts: an unreadable pane is the reader\'s Unknown, and a screen of only chrome is not growth', async () => {
    const screens = new FakeScreens();
    const reader = new ScreenTranscripts(screens, () => 'present');
    screens.next = { kind: 'unknown', why: { why: 'unreachable', detail: causeOf('gone') } };
    assert.equal((await reader.read('screen:w1:p3', UNREAD, 100)).kind, 'unknown');
    screens.next = { kind: 'screen', text: textOf('────\n❯ \n'), revision: countOf(1), truncated: 'absent' };
    const empty = await reader.read('screen:w1:p3', UNREAD, 100) as Chunk;
    assert.deepEqual([empty.grew, empty.entries.length], [false, 0]);
});

test('policy: opencode gets a column by default; the screen agents add kinds and `all` is a wildcard', () => {
    assert.deepEqual(DEFAULT_POLICY.kinds, ['claude', 'codex', 'opencode']);
    assert.equal(wantsKind(DEFAULT_POLICY, textOf('opencode')), 'present');
    assert.equal(wantsKind(DEFAULT_POLICY, textOf('gemini')), 'absent');
    assert.equal(wantsKind({ ...DEFAULT_POLICY, kinds: [textOf('*')] }, textOf('gemini')), 'present');
    assert.deepEqual(screenKindsOf(textOf('Gemini, qwen  copilot!')), ['gemini', 'qwen', 'copilot']);
    assert.deepEqual(screenKindsOf(textOf('gemini, ALL')), ['*']);
    assert.deepEqual(screenKindsOf(undefined), []);
    assert.deepEqual([screenSetting(textOf('gemini,,qwen')), screenSetting(textOf('all')), screenSetting(textOf(''))], ['gemini,qwen', 'all', '']);
});

test('loadSettings: TAB_RECAP_SCREEN_AGENTS widens the policy and says which kinds are read from the screen', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_SCREEN_AGENTS', 'TAB_RECAP_AGENTS'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-screen-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        delete process.env['TAB_RECAP_SCREEN_AGENTS'];
        delete process.env['TAB_RECAP_AGENTS'];
        assert.deepEqual([loadSettings().policy.kinds, loadSettings().screenAgents], [['claude', 'codex', 'opencode'], []]);
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_SCREEN_AGENTS=gemini, qwen\n');
        assert.deepEqual([loadSettings().policy.kinds, loadSettings().screenAgents], [['claude', 'codex', 'opencode', 'gemini', 'qwen'], ['gemini', 'qwen']]);
        process.env['TAB_RECAP_SCREEN_AGENTS'] = 'all';
        assert.deepEqual([loadSettings().policy.kinds.includes(textOf('*')), loadSettings().screenAgents], [true, ['*']]);
        process.env['TAB_RECAP_AGENTS'] = 'claude';
        assert.deepEqual(loadSettings().policy.kinds, ['claude', '*']);
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true });
    }
});

test('"the same screen" survives a repaint: reordered or repeated lines, ticking counters and the oldest lines sliding out are not news — a new line is', () => {
    const history = Array.from({ length: 60 }, (_, at) => `line ${String.fromCharCode(97 + (at % 26))}${'z'.repeat(at)}`);
    const same = steady(textOf(history.join('\n')));
    assert.equal(steady(textOf([...history, ...history.slice(-20)].join('\n'))), same, 'a repaint repeats the newest lines');
    assert.equal(steady(textOf(history.slice(10).join('\n'))), same, 'the oldest lines slid out of the window');
    assert.equal(steady(textOf(`${history.join('\n')}\nelapsed 12s`)), steady(textOf(`${history.join('\n')}\nelapsed 98s`)), 'counters tick');
    assert.notEqual(steady(textOf(`${history.join('\n')}\nsomething new was said`)), same);
    assert.equal(cleanScreen(textOf('same\nsame\nsame\nother\nsame'), CLAUDE_SCREEN_CHROME), 'same\nother\nsame', 'a notice printed again right after itself is one line');
});
