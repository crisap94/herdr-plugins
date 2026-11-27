import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { tokensOf } from '@stateforge-labs/session-ledger';
import { clockOf, figuresOf } from '#src/view-model/compaction-stage.ts';
import { present, presentBar } from '#src/view-model/present.ts';
import { plain } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { blankRecap } from '@stateforge-labs/session-ledger';
import type { CompactionRow } from '#src/ports/compaction-records.ts';
import { parseDuration, parseTokens } from '@stateforge-labs/recap-view';
import { maybe } from '#src/view-model/column.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { wordingOf } from '#src/view-model/wording.ts';

const base: CompactionRow = { id: must(parseCompactionId('cmp_x')), tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', brief: 'written', writer: textOf('codex · gpt-6-luna · high'), templateWhy: null, startedAt: instant(0), stageAt: instant(0), finishedAt: null, tokensBefore: null, tokensAfter: null, took: null, retry: 'first-try', queue: 'direct', why: null, origin: 'operator' };

test('the stage replaces the hint while it is shown and the hint is back after; the bar goes back to the usual headline', () => {
    const tab = viewRecord({ tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'Victoria', cwd: null, context: { tokens: countOf(600_000), window: countOf(1_000_000), source: 'catalogue' as const } }] });
    const view = { tab, recap: blankRecap(tabId('w1:t1')), notes: new Map(), warnings: [], now: 0, messages: en, compactHint: 40, style: plain };
    assert.match(present(view, 44, () => null).join('\n'), /compact\? 60% of 1M/);
    const shown = present({ ...view, compactions: [base] }, 44, () => null).join('\n');
    assert.ok(shown.includes('◐ compacting… 0:00') && !shown.includes('compact?'), 'they never stand together');
    assert.ok(!presentBar(view, 46).join('').includes('compacting'));
    assert.match(presentBar({ ...view, compactions: [base] }, 46).join(''), /compacting claude/);
});

test('on the bar, the newest compaction of the tab speaks, prefixed with its agent', () => {
    const tab = viewRecord({ tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null }, { pane: 'w1:p2', agent: 'codex', status: 'idle', title: null, cwd: null }] });
    const older = { ...base, startedAt: instant(1), stage: 'compacted' as const, finishedAt: instant(5) };
    const newer = { ...base, pane: paneId('w1:p2'), agent: agentKind('codex'), startedAt: instant(9), stageAt: instant(9000) };
    const lines = presentBar({ tab, recap: blankRecap(tabId('w1:t1')), notes: new Map(), warnings: [], now: 12_000, messages: en, compactions: [older, newer], style: plain }, 60);
    assert.match(lines.join(''), /◐ compacting codex… 0:03/);
});

const said = (tokensBefore: number | null, tokensAfter: number | null, tookMs: number | null): object => figuresOf({ tokensBefore: maybe(tokensBefore, parseTokens), tokensAfter: maybe(tokensAfter, parseTokens), tookMs: maybe(tookMs, parseDuration) }, wordingOf(en));

test('numbers: the short token form; a pair needs both counts, a missing number is left out, never guessed; the clock is m:ss from the stage start', () => {
    assert.deepEqual([812, 1000, 3057, 39_532, 100_000, 554_888, 1_000_000, 1_250_000].map((size) => tokensOf(countOf(size))), ['812', '1k', '3.1k', '39.5k', '100k', '554.9k', '1M', '1.3M']);
    assert.deepEqual(said(39_532, 3057, 15_588), { pair: '39.5k → 3.1k', tokens: '39.5k → 3.1k tokens', took: '16 s' });
    assert.deepEqual(said(39_532, null, null), { pair: '', tokens: '', took: '' });
    assert.deepEqual(said(null, 3057, 59_400), { pair: '', tokens: '', took: '59 s' });
    assert.deepEqual([clockOf(0, 8000), clockOf(0, 12_000), clockOf(1000, 61_000), clockOf(5000, 1000)], ['0:08', '0:12', '1:00', '0:00']);
});
