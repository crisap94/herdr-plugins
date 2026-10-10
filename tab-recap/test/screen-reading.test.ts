import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScreenTranscripts, SCREEN_READER_ID } from '#src/adapters/screen-transcripts.ts';
import { loadConfig } from '#src/daemon/config.ts';
import { cleanScreen, screenEntries, steady } from '#src/recap/application/screen-text.ts';
import { DEFAULT_POLICY, screenKindsOf, screenSetting, wantsKind } from '#src/recap/domain/policy.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Chunk } from '#src/ports/transcripts.ts';
import type { ScreenResult, Screens } from '#src/ports/screens.ts';

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
    assert.equal(cleanScreen(SCREEN), '● I fixed the parser and the tests pass now.\n\n  Ran 2 shell commands');
    assert.equal(cleanScreen('────\n❯ \n⏵⏵ bypass permissions on'), '');
    assert.deepEqual(screenEntries(SCREEN).map((entry) => entry.text), ['● I fixed the parser and the tests pass now.', '  Ran 2 shell commands']);
    assert.ok(screenEntries('x'.repeat(5000)).every((entry) => entry.text.length <= 2000), 'no entry outgrows the excerpt clip');
});

class FakeScreens implements Screens {
    asked: { pane: string; lines: number }[] = [];
    next: ScreenResult = { kind: 'screen', text: SCREEN, revision: 7, truncated: false };
    readScreen(pane: string, lines: number): Promise<ScreenResult> {
        this.asked.push({ pane, lines });
        return Promise.resolve(this.next);
    }
}

const lane = (agent: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: 'w1:p3', tabId: 'w1:t1', workspaceId: 'w1', agent });

test('ScreenTranscripts: only for the kinds asked, one source per pane, the revision is the cursor and a hash of the clean text the tail', async () => {
    const screens = new FakeScreens();
    const reader = new ScreenTranscripts(screens, (agent) => agent === 'gemini');
    assert.equal(reader.agent, SCREEN_READER_ID);
    assert.equal((await reader.locate(lane('qwen'))).kind, 'unknown');
    const located = await reader.locate(lane('gemini'));
    assert.deepEqual(located, { kind: 'located', source: 'screen:w1:p3' });
    const first = await reader.read('screen:w1:p3', UNREAD, 10_000) as Chunk;
    assert.deepEqual(screens.asked, [{ pane: 'w1:p3', lines: 200 }]);
    assert.equal(first.grew, true);
    assert.equal(first.position.cursor, 7);
    assert.match(first.position.tail ?? '', /^[0-9a-f]{16}$/);
    assert.equal(first.entries.length, 2);
    screens.next = { kind: 'screen', text: `${SCREEN}\n`, revision: 9, truncated: false };
    const repainted = await reader.read('screen:w1:p3', first.position, 10_000) as Chunk;
    assert.deepEqual([repainted.grew, repainted.entries.length, repainted.position.cursor, repainted.position.tail], [false, 0, 9, first.position.tail]);
    screens.next = { kind: 'screen', text: `${SCREEN}\n\n● Now the lint.`, revision: 11, truncated: false };
    const changed = await reader.read('screen:w1:p3', repainted.position, 10_000) as Chunk;
    assert.equal(changed.grew, true);
});

test('ScreenTranscripts: an unreadable pane is the reader\'s Unknown, and a screen of only chrome is not growth', async () => {
    const screens = new FakeScreens();
    const reader = new ScreenTranscripts(screens, () => true);
    screens.next = { kind: 'unknown', why: { why: 'unreachable', detail: 'gone' } };
    assert.equal((await reader.read('screen:w1:p3', UNREAD, 100)).kind, 'unknown');
    screens.next = { kind: 'screen', text: '────\n❯ \n', revision: 1, truncated: false };
    const empty = await reader.read('screen:w1:p3', UNREAD, 100) as Chunk;
    assert.deepEqual([empty.grew, empty.entries.length], [false, 0]);
});

test('policy: opencode gets a column by default; the screen agents add kinds and `all` is a wildcard', () => {
    assert.deepEqual(DEFAULT_POLICY.kinds, ['claude', 'codex', 'opencode']);
    assert.equal(wantsKind(DEFAULT_POLICY, 'opencode'), true);
    assert.equal(wantsKind(DEFAULT_POLICY, 'gemini'), false);
    assert.equal(wantsKind({ ...DEFAULT_POLICY, kinds: ['*'] }, 'gemini'), true);
    assert.deepEqual(screenKindsOf('Gemini, qwen  copilot!'), ['gemini', 'qwen', 'copilot']);
    assert.deepEqual(screenKindsOf('gemini, ALL'), ['*']);
    assert.deepEqual(screenKindsOf(undefined), []);
    assert.deepEqual([screenSetting('gemini,,qwen'), screenSetting('all'), screenSetting('')], ['gemini,qwen', 'all', '']);
});

test('loadConfig: TAB_RECAP_SCREEN_AGENTS widens the policy and says which kinds are read from the screen', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_SCREEN_AGENTS', 'TAB_RECAP_AGENTS'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-screen-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        delete process.env['TAB_RECAP_SCREEN_AGENTS'];
        delete process.env['TAB_RECAP_AGENTS'];
        assert.deepEqual([loadConfig().policy.kinds, loadConfig().screenAgents], [['claude', 'codex', 'opencode'], []]);
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_SCREEN_AGENTS=gemini, qwen\n');
        assert.deepEqual([loadConfig().policy.kinds, loadConfig().screenAgents], [['claude', 'codex', 'opencode', 'gemini', 'qwen'], ['gemini', 'qwen']]);
        process.env['TAB_RECAP_SCREEN_AGENTS'] = 'all';
        assert.deepEqual([loadConfig().policy.kinds.includes('*'), loadConfig().screenAgents], [true, ['*']]);
        process.env['TAB_RECAP_AGENTS'] = 'claude';
        assert.deepEqual(loadConfig().policy.kinds, ['claude', '*']);
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true });
    }
});

test('"the same screen" survives a repaint: reordered or repeated lines, ticking counters and the oldest lines sliding out are not news — a new line is', () => {
    const history = Array.from({ length: 60 }, (_, at) => `line ${String.fromCharCode(97 + (at % 26))}${'z'.repeat(at)}`);
    const same = steady(history.join('\n'));
    assert.equal(steady([...history, ...history.slice(-20)].join('\n')), same, 'a repaint repeats the newest lines');
    assert.equal(steady(history.slice(10).join('\n')), same, 'the oldest lines slid out of the window');
    assert.equal(steady(`${history.join('\n')}\nelapsed 12s`), steady(`${history.join('\n')}\nelapsed 98s`), 'counters tick');
    assert.notEqual(steady(`${history.join('\n')}\nsomething new was said`), same);
    assert.equal(cleanScreen('same\nsame\nsame\nother\nsame'), 'same\nother\nsame', 'a notice printed again right after itself is one line');
});
