import { parseUsd } from '#src/recap/domain/usd.ts';
import { policyOf } from './fakes/settings-readers.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { instant } from '#src/recap/domain/time.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AutocompactMode } from '#src/recap/domain/autocompact.ts';
import type { DecidedResult } from '#src/ports/decider.ts';
import type { DecisionMode } from '#src/ports/autocompact-records.ts';
import { NOW, lane, rows, tuningOfKeys, world } from './autocompact-world.ts';
import type { World } from './autocompact-world.ts';
import { decidedOf } from './fakes/decider-fixtures.ts';

const env = (keys: Readonly<Record<string, string>>) => (key: string): string | undefined => keys[key];

function styled(keys: Readonly<Record<string, string>>, mode: AutocompactMode = 'on'): World {
    return world({ ...policyOf(env(keys)), mode }, true, 0, tuningOfKeys(keys));
}

const answer = (closes: number, rest = 0.15): DecidedResult => (decidedOf({ closes_request: closes, announces_continuation: rest, asks_detailed_choice: rest, needs_verbatim: rest, changes_subject: rest, stuck: rest }));

function decidedMinutesAgo(w: World, minutes: number, verdict: 'wait' | 'undecided' | 'compact', mode: DecisionMode = 'on'): void {
    w.store.autocompact.record({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - minutes * 60_000), mode, share: 12, tokens: must(parseCount(120_000)), window: must(parseCount(1_000_000)), gate: 'ask', verdict, askedVerdict: verdict, answers: {}, coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null });
}

test('the decider\'s answers become the verdict under the style: a close of 0.65 compacts under eager and is undecided under balanced and gentle', async () => {
    const outcomes: Array<[string, string | undefined, number]> = [];
    for (const style of ['eager', 'balanced', 'gentle']) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        w.decide = (): DecidedResult => answer(0.65);
        w.share = 62;
        await w.service.consider(lane());
        outcomes.push([style, rows(w)[0]?.verdict, w.requests.length]);
    }
    assert.deepEqual(outcomes, [['eager', 'compact', 1], ['balanced', 'undecided', 0], ['gentle', 'undecided', 0]]);
});

test('the decider\'s answers under gentle: a warning of 0.25 is a wait, and under balanced and eager it is compact', async () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.25, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    const verdicts: Array<string | undefined> = [];
    for (const style of ['gentle', 'balanced', 'eager']) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        w.decide = (): DecidedResult => (decidedOf(warned));
        w.share = 62;
        await w.service.consider(lane());
        verdicts.push(rows(w)[0]?.verdict);
    }
    assert.deepEqual(verdicts, ['wait', 'compact', 'compact']);
});

test('the re-check asks an unchanged lane again only when its last decision was a wait (or undecided); a compact one is not asked again', async () => {
    const cases: Array<[string, 'wait' | 'undecided' | 'compact', DecisionMode]> = [
        ['wait', 'wait', 'on'],
        ['undecided', 'undecided', 'on'],
        ['compact', 'compact', 'on'],
        ['shadow wait', 'wait', 'shadow'],
    ];
    const outcomes = [];
    for (const [name, verdict, mode] of cases) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }, mode);
        decidedMinutesAgo(w, 35, verdict, mode);
        w.share = 12;
        await w.service.consider(lane());
        outcomes.push([name, w.asked.length, w.logs.some((line) => line.endsWith('unchanged → recheck'))]);
    }
    assert.deepEqual(outcomes, [['wait', 1, true], ['undecided', 1, true], ['compact', 0, false], ['shadow wait', 1, true]]);
});
