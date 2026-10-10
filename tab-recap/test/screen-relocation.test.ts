import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_SCREEN_CHROME } from '#src/adapters/screen-transcripts.ts';
import { cleanScreen } from '#src/recap/application/screen-text.ts';

test('screen chrome filtering keeps the old output for Claude chrome, box lines, spinners, and repeated lines', () => {
    const corpus = [
        '  Kept line',
        'esc to interrupt',
        'shift+tab to cycle',
        '? for shortcuts',
        '⏵⏵ prompt',
        'bypass permissions on',
        '(ctrl+c to cancel)',
        '✻ Thinking… (12s · ↓ 1.2k tokens)',
        '❯ ',
        '────',
        '',
        'same',
        'same',
        'other',
        'same',
    ].join('\n');
    assert.equal(cleanScreen(corpus, CLAUDE_SCREEN_CHROME), 'Kept line\n\nsame\nother\nsame');
});
