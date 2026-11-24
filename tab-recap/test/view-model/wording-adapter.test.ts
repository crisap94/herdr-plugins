import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFor, type Locale } from '#src/i18n/index.ts';
import { figuresOf, stageLine } from '#src/view-model/compaction-stage.ts';
import { present } from '#src/view-model/present.ts';
import { plain } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { blankRecap } from '@stateforge-labs/session-ledger';
import type { CompactionRow } from '#src/ports/compaction-records.ts';
import { parseDuration, parseTokens } from '@stateforge-labs/recap-view';
import { assertAmount, assertMinutes, assertSeconds, parseCount as parseViewCount, parseWords, type Amount, type Minutes, type Seconds } from '@stateforge-labs/recap-view/unstable/wording.ts';
import { maybe } from '#src/view-model/column.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { wordingOf } from '#src/view-model/wording.ts';

const LOCALES: readonly Locale[] = ['en', 'es'];

const done: CompactionRow = {
    id: must(parseCompactionId('cmp_x')), tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacted', brief: 'written', writer: textOf('codex'), templateWhy: null,
    startedAt: instant(0), stageAt: instant(0), finishedAt: instant(1), tokensBefore: countOf(39532), tokensAfter: countOf(3057), took: duration(15588), retry: 'first-try', queue: 'direct', why: null, origin: 'operator',
};

const amountOf = (n: number): Amount => {
    assertAmount(n);
    return n;
};

const secondsOf = (n: number): Seconds => {
    assertSeconds(n);
    return n;
};

const minutesOf = (n: number): Minutes => {
    assertMinutes(n);
    return n;
};

const figures = (locale: Locale, tookMs: number | null): object =>
    figuresOf({ tokensBefore: maybe(39532, parseTokens), tokensAfter: maybe(3057, parseTokens), tookMs: maybe(tookMs, parseDuration) }, wordingOf(messagesFor(locale)));

for (const locale of LOCALES) {
    test(`wordingOf (${locale}): the column, the stage line and the figures say what the catalog says`, () => {
        const messages = messagesFor(locale);
        const tab = viewRecord({ tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'Victoria', cwd: null }] });
        const view = { tab, recap: blankRecap(tabId('w1:t1')), notes: new Map(), warnings: [], now: 0, messages, compactions: [done], style: plain };
        assert.ok(present(view, 44, () => null).join('\n').includes(messages.badge.idle));
        assert.match(stageLine(done, 0, { messages, style: plain }), /39\.5k → 3\.1k/);
        assert.equal(wordingOf(messages), wordingOf(messages), 'one wording per catalog');
    });

    test(`wordingOf (${locale}): a clock that stepped back prints a negative duration, and a missing duration prints nothing, without throwing`, () => {
        assert.deepEqual(figures(locale, -3000), { pair: '39.5k → 3.1k', tokens: wordingOf(messagesFor(locale)).compaction.stage.tokens(parseWords('39.5k'), parseWords('3.1k')), took: '-3 s' });
        assert.equal((figures(locale, null) as { took: string }).took, '');
        assert.equal((figures(locale, 75_000) as { took: string }).took, '1 min 15 s');
    });

    test(`wordingOf (${locale}): the counted and measured entries reach the catalog's text`, () => {
        const messages = messagesFor(locale);
        const wording = wordingOf(messages);
        assert.equal(wording.taskNumber(parseViewCount(7)), messages.taskNumber(countOf(7)));
        assert.equal(wording.ago(amountOf(5), 'min'), messages.ago(countOf(5), 'min'));
        assert.equal(wording.expanded.waiting(amountOf(2), 'h'), messages.expanded.waiting(countOf(2), 'h'));
        assert.equal(wording.expanded.compactionOrigin.auto(parseViewCount(3)), messages.expanded.compactionOrigin.auto(countOf(3)));
        assert.equal(wording.daemonStale(null), messages.daemonStale(null));
        assert.equal(wording.compaction.stage.failed(null, parseWords('why')), messages.compaction.stage.failed(null, textOf('why')));
        assert.equal(wording.chapters.minutes(minutesOf(2), secondsOf(5)), messages.chapters.minutes(countOf(2), countOf(5)));
    });
}
