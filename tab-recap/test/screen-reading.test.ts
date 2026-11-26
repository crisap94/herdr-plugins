import { textOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_SCREEN_CHROME, ScreenTranscripts, SCREEN_READER_ID } from '#src/adapters/transcripts/screen.ts';
import { cleanScreen, steady } from '#src/recap/application/screen-text.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { UNREAD, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { Chunk } from '@stateforge-labs/session-ledger';
import type { ScreenOutcome, ScreenReader } from '#src/ports/screens.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
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


test('"the same screen" survives a repaint: reordered or repeated lines, ticking counters and the oldest lines sliding out are not news — a new line is', () => {
    const history = Array.from({ length: 60 }, (_, at) => `line ${String.fromCharCode(97 + (at % 26))}${'z'.repeat(at)}`);
    const same = steady(textOf(history.join('\n')));
    assert.equal(steady(textOf([...history, ...history.slice(-20)].join('\n'))), same, 'a repaint repeats the newest lines');
    assert.equal(steady(textOf(history.slice(10).join('\n'))), same, 'the oldest lines slid out of the window');
    assert.equal(steady(textOf(`${history.join('\n')}\nelapsed 12s`)), steady(textOf(`${history.join('\n')}\nelapsed 98s`)), 'counters tick');
    assert.notEqual(steady(textOf(`${history.join('\n')}\nsomething new was said`)), same);
    assert.equal(cleanScreen(textOf('same\nsame\nsame\nother\nsame'), CLAUDE_SCREEN_CHROME), 'same\nother\nsame', 'a notice printed again right after itself is one line');
});
