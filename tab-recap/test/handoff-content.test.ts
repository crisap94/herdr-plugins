import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffContent } from '#src/recap/application/handoff-content.ts';
import type { HandoffInput } from '#src/recap/application/handoff-content.ts';
import { NOTE_LIMIT } from '#src/recap/application/compaction-message.ts';
import { CLOSED_SHOWN_MS, taskFactsOf } from '#src/recap/application/ledger-input.ts';
import type { TaskFacts } from '#src/recap/application/ledger-input.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { FORBIDDEN_PHRASES, FORBIDDEN_WORDS } from '#src/recap/domain/forbidden-words.ts';
import type { HandoffBody, HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { handoffId } from '#src/recap/domain/ids.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { fact } from './fakes/fact-at.ts';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ID = handoffId('0190f5a4-7c2e-7b1a-9d3f-0123456789ab');
const OTHER_ID = handoffId('0190f5a4-7c2e-7b1a-9d3f-0123456789ac');
const TASK: TaskId = { tab: 'w1:t1', key: 't1' };

const FRESHNESS: Freshness = { lastRun: { at: NOW - 60_000, cause: 'turn-ended' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' };
const WORKSITE: WorksiteSnapshot = { kind: 'unavailable' };

const closedFact = (id: string, section: Fact['section'], text: string, closedAt: number, closedWhy: Fact['closedWhy'] = 'superseded'): Fact =>
    fact(id, section, text, closedAt, { state: 'closed', closedWhy, closedAt, lastAt: closedAt });

const taskOf = (open: readonly Fact[], closed: readonly Fact[] = []): TaskFacts => ({ key: TASK.key, open, closed });

const inputOf = (task: TaskFacts, more: Partial<HandoffInput> = {}): HandoffInput => ({ id: ID, at: NOW, task, freshness: FRESHNESS, worksite: WORKSITE, note: null, ...more });

const bodyOf = (content: HandoffContent): HandoffBody => (content.kind === 'content' ? content : assert.fail(`refused ${content.reason}`));

const groupOf = (body: HandoffBody, id: HandoffGroupId): HandoffGroup => body.groups.find((group) => group.id === id) ?? assert.fail(`no ${id} group`);

const firstOf = (body: HandoffBody, id: HandoffGroupId): HandoffEntry => groupOf(body, id).entries[0] ?? assert.fail(`no entry in ${id}`);

const textsOf = (body: HandoffBody, id: HandoffGroupId): readonly string[] => groupOf(body, id).entries.map((entry) => entry.text);

const refusedBy = (content: HandoffContent): string => (content.kind === 'refused' ? content.reason : assert.fail('expected a refusal'));

test('every fact class is rendered in its group with its text and last-seen time', () => {
    const body = bodyOf(
        buildHandoffContent(
            inputOf(
                taskOf(
                    [
                        fact('g1', 'goal', 'ship the lane handoff', NOW - 9_000),
                        fact('n1', 'now', 'writing the content builder', NOW - 8_000),
                        fact('d1', 'needs', 'an answer about the budget', NOW - 7_000),
                        fact('o1', 'done', 'the freshness model is in', NOW - 6_000),
                        fact('c1', 'decisions', 'keep the ledger as the one source', NOW - 5_000, { why: 'the reader needs one source' }),
                        fact('x1', 'next', 'run the serializer brief', NOW - 4_000),
                        fact('l1', 'links', 'the design section on content', NOW - 3_000),
                        fact('r1', 'rules', 'no comments in code', NOW - 2_000),
                    ],
                    [closedFact('z1', 'next', 'the old plan was replaced', NOW - 90 * 60_000)],
                ),
            ),
        ),
    );
    assert.deepEqual(textsOf(body, 'goal'), ['ship the lane handoff']);
    assert.deepEqual(textsOf(body, 'now'), ['writing the content builder']);
    assert.deepEqual(textsOf(body, 'needs'), ['an answer about the budget']);
    assert.deepEqual(textsOf(body, 'done'), ['the freshness model is in']);
    assert.deepEqual(textsOf(body, 'decisions'), ['keep the ledger as the one source']);
    assert.deepEqual(textsOf(body, 'next'), ['run the serializer brief']);
    assert.deepEqual(textsOf(body, 'links'), ['the design section on content']);
    assert.deepEqual(textsOf(body, 'rules'), ['no comments in code']);
    assert.deepEqual(textsOf(body, 'closed'), ['the old plan was replaced']);
    assert.equal(firstOf(body, 'decisions').lastAt, NOW - 5_000);
    assert.equal(body.freshness, FRESHNESS);
    assert.equal(body.worksite, WORKSITE);
    assert.equal(body.at, NOW);
    assert.equal(body.id, ID);
});

test('a decision keeps its recorded reason and a closed fact keeps the reason it closed', () => {
    const body = bodyOf(
        buildHandoffContent(
            inputOf(
                taskOf(
                    [fact('d1', 'decisions', 'use the outcome table', NOW - 1_000, { why: 'one table feeds three readers' }), fact('g1', 'goal', 'land the handoff', NOW - 2_000)],
                    [closedFact('c1', 'next', 'the probe plan', NOW - 1_500, 'answered')],
                ),
            ),
        ),
    );
    const decision = firstOf(body, 'decisions');
    const closed = firstOf(body, 'closed');
    assert.equal(decision.reason, 'one table feeds three readers');
    assert.equal(closed.reason, 'answered');
    assert.equal(closed.lastAt, NOW - 1_500);
});

test('the groups come in the fixed order, the recently closed group last', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]))));
    assert.deepEqual(body.groups.map((group) => group.id), ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules', 'closed']);
    assert.deepEqual(body.groups.map((group) => group.id), [...HANDOFF_GROUP_IDS]);
});

test('the newest facts are selected by last-seen time and rendered by first-seen time then id', () => {
    const done = Array.from({ length: 16 }, (_, index) => fact(`d${index}`, 'done', `done ${index}`, 1_000 + index, { lastAt: index === 0 ? 9_000 : 2_000 + index }));
    const body = bodyOf(buildHandoffContent(inputOf(taskOf(done.toReversed(), [closedFact('c0', 'done', 'closed', NOW - 60_000)]))));
    const group = groupOf(body, 'done');
    assert.deepEqual(group.entries.map((entry) => entry.id), ['d0', ...Array.from({ length: 14 }, (_, index) => `d${index + 2}`)]);
    assert.equal(group.capped, 1);
});

test('facts first seen in the same instant are rendered by fact id', () => {
    const body = bodyOf(
        buildHandoffContent(inputOf(taskOf([fact('n3', 'now', 'third', NOW - 1_000, { firstAt: NOW - 5_000 }), fact('n1', 'now', 'first', NOW - 2_000, { firstAt: NOW - 5_000 }), fact('n2', 'now', 'second', NOW - 3_000, { firstAt: NOW - 5_000 })]))),
    );
    assert.deepEqual(textsOf(body, 'now'), ['first', 'second', 'third']);
});

test('the recently closed group shows its newest 15 by last-seen time and counts the rest', () => {
    const closed = Array.from({ length: 17 }, (_, index) => closedFact(`c${index}`, 'next', `closed ${index}`, NOW - 3_000_000 + index));
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)], closed))));
    const group = groupOf(body, 'closed');
    assert.equal(group.entries.length, 15);
    assert.equal(group.capped, 2);
    assert.deepEqual(group.entries.map((entry) => entry.id), Array.from({ length: 15 }, (_, index) => `c${index + 2}`));
});

test('the same ledger renders the same content, whatever order the ledger returned it in', () => {
    const open = [fact('g1', 'goal', 'goal', NOW - 3_000), fact('n1', 'now', 'now', NOW - 2_000), fact('n2', 'now', 'now two', NOW - 1_000)];
    const closed = [closedFact('c1', 'next', 'closed one', NOW - 4_000)];
    const first = buildHandoffContent(inputOf(taskOf(open, closed)));
    const second = buildHandoffContent(inputOf(taskOf(open.toReversed(), closed)));
    assert.deepEqual(first, second);
});

test('identical inputs including the HandoffId give identical output, and a different HandoffId changes only the id', () => {
    const task = taskOf([fact('g1', 'goal', 'the goal', NOW - 1_000)]);
    assert.deepEqual(buildHandoffContent(inputOf(task)), buildHandoffContent(inputOf(task)));
    const first = bodyOf(buildHandoffContent(inputOf(task)));
    const second = bodyOf(buildHandoffContent(inputOf(task, { id: OTHER_ID })));
    assert.notEqual(first.id, second.id);
    assert.deepEqual({ ...first, id: second.id }, second);
});

test('the injected instant decides the recently closed window', () => {
    const since: number[] = [];
    const ledger = {
        openOf: (): readonly Fact[] => [],
        recentlyClosed: (_task: TaskId, sinceMs: number): readonly Fact[] => {
            since.push(sinceMs);
            return [];
        },
    };
    const task = taskFactsOf(ledger, TASK, NOW);
    assert.deepEqual(since, [NOW - CLOSED_SHOWN_MS]);
    assert.deepEqual(task.closed, []);
});

test('a task whose pane has session history renders none of it, only the ledger facts', () => {
    const ledger = {
        openOf: (): readonly Fact[] => [fact('g1', 'goal', 'the ledger goal', NOW - 1_000)],
        recentlyClosed: (): readonly Fact[] => [],
        historyOf: (): never => assert.fail('session history must not be read'),
    };
    const body = bodyOf(buildHandoffContent(inputOf(taskFactsOf(ledger, TASK, NOW))));
    assert.deepEqual(textsOf(body, 'goal'), ['the ledger goal']);
    assert.equal(body.groups.reduce((count, group) => count + group.entries.length, 0), 1);
});

test('a task with no open and no recently closed facts is refused as ledger-empty', () => {
    assert.equal(refusedBy(buildHandoffContent(inputOf(taskOf([], [])))), 'ledger-empty');
});

test('a task with only a goal is not ledger-empty', () => {
    assert.equal(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'a goal', NOW)]))).kind, 'content');
});

test('a decision whose reason names a forbidden word is dropped whole and counted as withheld', () => {
    const body = bodyOf(
        buildHandoffContent(
            inputOf(
                taskOf([
                    fact('g1', 'goal', 'keep the schema stable', NOW - 3_000),
                    fact('d1', 'decisions', 'use the shared cache', NOW - 2_000, { why: 'the herdr panel reads it' }),
                    fact('d2', 'decisions', 'keep the schema', NOW - 1_000, { why: 'the reader needs it' }),
                ]),
            ),
        ),
    );
    assert.deepEqual(textsOf(body, 'decisions'), ['keep the schema']);
    assert.equal(firstOf(body, 'decisions').reason, 'the reader needs it');
    assert.equal(body.withheld, 1);
});

test('a decision whose text names a forbidden word is dropped whole, reason and all', () => {
    const body = bodyOf(
        buildHandoffContent(
            inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW - 2_000), fact('d1', 'decisions', 'the plugin keeps it', NOW - 1_000, { why: 'a clean reason' })])),
        ),
    );
    assert.deepEqual(textsOf(body, 'decisions'), []);
    assert.equal(body.withheld, 1);
});

test('the rest of a mixed ledger is delivered and the withheld facts are counted', () => {
    const body = bodyOf(
        buildHandoffContent(
            inputOf(
                taskOf([
                    fact('g1', 'goal', 'finish the parser', NOW - 4_000),
                    fact('n1', 'now', 'the plugin reads the file', NOW - 3_000),
                    fact('n2', 'now', 'the tool call returned an error', NOW - 2_000),
                    fact('x1', 'next', 'open the herdr view', NOW - 1_000),
                ]),
            ),
        ),
    );
    assert.deepEqual(textsOf(body, 'now'), ['the tool call returned an error']);
    assert.deepEqual(textsOf(body, 'next'), []);
    assert.equal(body.withheld, 2);
});

test('a forbidden goal is withheld and the other facts are kept', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the tab-recap goal', NOW - 2_000), fact('r1', 'rules', 'no comments', NOW - 1_000)]))));
    assert.deepEqual(textsOf(body, 'goal'), []);
    assert.deepEqual(textsOf(body, 'rules'), ['no comments']);
    assert.equal(body.withheld, 1);
});

test('content is empty when every fact is withheld', () => {
    const content = buildHandoffContent(
        inputOf(taskOf([fact('g1', 'goal', 'the plugin goal', NOW - 2_000), fact('n1', 'now', 'a herdr pane', NOW - 1_000)])),
    );
    assert.equal(refusedBy(content), 'content-empty');
});

test('a closed fact that names a forbidden word is withheld', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW - 2_000)], [closedFact('c1', 'now', 'a recap ran', NOW - 1_000)]))));
    assert.deepEqual(textsOf(body, 'closed'), []);
    assert.equal(body.withheld, 1);
});

test('forbidden words across every template of the shared list are withheld from every section', () => {
    const samples = [...FORBIDDEN_WORDS.flatMap((template) => (template.endsWith('s?') ? [template.slice(0, -2), template.slice(0, -1)] : [template])), ...FORBIDDEN_PHRASES];
    for (const sample of samples) {
        const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW - 2_000), fact('x1', 'next', `call it ${sample} now`, NOW - 1_000)]))));
        assert.deepEqual(textsOf(body, 'next'), [], sample);
        assert.equal(body.withheld, 1, sample);
        assert.equal(isForbidden(`call it ${sample} now`), true, sample);
    }
});

test('the focus note is normalized: control characters out, whitespace collapsed, trimmed', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]), { note: '  focus\ton the\u001b parser\n\n  now ' })));
    assert.equal(body.note, 'focus on the parser now');
});

test('a note with a tab, an escape and a line break leaves no control character', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]), { note: 'a\tb\u001bc\nd' })));
    assert.equal(body.note, 'a bc d');
    assert.doesNotMatch(body.note, /\p{Cc}/u);
});

test('an oversized note is cut to the note limit in code points', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]), { note: '𝕏'.repeat(NOTE_LIMIT + 20) })));
    assert.equal(Array.from(body.note ?? '').length, NOTE_LIMIT);
});

test('a blank note is no note', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]), { note: '   \n\t ' })));
    assert.equal(body.note, null);
});

test('a note that names a forbidden word is dropped and the handoff is still rendered', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)]), { note: 'focus on the herdr pane' })));
    assert.equal(body.note, null);
    assert.deepEqual(textsOf(body, 'goal'), ['the goal']);
    assert.equal(body.withheld, 0);
});

test('a fact whose control character would join a forbidden word is withheld, because the vetted text is the sent text', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW - 2_000), fact('x1', 'next', 'her\u001bdr lane', NOW - 1_000)]))));
    assert.deepEqual(textsOf(body, 'next'), []);
    assert.equal(body.withheld, 1);
});

test('a stored fact text has its control characters removed and its whitespace collapsed', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'a\u001bb  c\n d', NOW - 1_000)]))));
    assert.deepEqual(textsOf(body, 'goal'), ['ab c d']);
});

test('a decision reason whose control character would join a forbidden word is withheld whole', () => {
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('d1', 'decisions', 'keep the ledger', NOW - 1_000, { why: 'her\u001bdr reads it' }), fact('g1', 'goal', 'the goal', NOW - 2_000)]))));
    assert.deepEqual(textsOf(body, 'decisions'), []);
    assert.equal(body.withheld, 1);
});

test('the done, links and recently closed groups each keep their newest 15 and count the rest', () => {
    const open = [
        fact('g1', 'goal', 'the goal', NOW - 1_000),
        ...Array.from({ length: 16 }, (_, index) => fact(`d${index}`, 'done', `done ${index}`, NOW - 20_000 + index * 1_000)),
        ...Array.from({ length: 16 }, (_, index) => fact(`l${index}`, 'links', `link ${index}`, NOW - 20_000 + index * 1_000)),
    ];
    const closed = Array.from({ length: 16 }, (_, index) => closedFact(`c${index}`, 'next', `closed ${index}`, NOW - 3_000_000 + index * 1_000));
    const body = bodyOf(buildHandoffContent(inputOf(taskOf(open, closed))));
    for (const [id, prefix] of [['done', 'd'], ['links', 'l'], ['closed', 'c']] as const) {
        const group = groupOf(body, id);
        assert.equal(group.entries.length, 15, id);
        assert.equal(group.capped, 1, id);
        assert.equal(group.entries[0]?.id, `${prefix}1`, id);
    }
});

test('a withheld fact does not use a cap slot, and the cap counts only the facts that were kept', () => {
    const links = Array.from({ length: 16 }, (_, index) => fact(`l${index}`, 'links', index === 15 ? 'the herdr link' : `link ${index}`, NOW - 20_000 + index * 1_000));
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW), ...links]))));
    const group = groupOf(body, 'links');
    assert.equal(group.entries.length, 15);
    assert.equal(group.capped, 0);
    assert.equal(body.withheld, 1);
    assert.equal(firstOf(body, 'links').text, 'link 0');
});

test('facts with the same last-seen time keep the lowest ids when the cap cuts between them', () => {
    const done = Array.from({ length: 16 }, (_, index) => fact(`d${String(index).padStart(2, '0')}`, 'done', `done ${index}`, NOW - 5_000)).toReversed();
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW), ...done]))));
    const group = groupOf(body, 'done');
    assert.deepEqual(group.entries.map((entry) => entry.id), Array.from({ length: 15 }, (_, index) => `d${String(index).padStart(2, '0')}`));
    assert.equal(group.capped, 1);
});

test('a recently closed fact outside the window, or with no close time, is not shown', () => {
    const stale = closedFact('c1', 'next', 'stale plan', NOW - CLOSED_SHOWN_MS - 1);
    const untimed = { ...closedFact('c2', 'next', 'untimed plan', NOW - 1_000), closedAt: null };
    const body = bodyOf(buildHandoffContent(inputOf(taskOf([fact('g1', 'goal', 'the goal', NOW)], [stale, untimed, closedFact('c3', 'next', 'fresh plan', NOW - 1_000)]))));
    assert.deepEqual(textsOf(body, 'closed'), ['fresh plan']);
    assert.equal(body.withheld, 0);
});

test('a ledger whose only closed facts are outside the window is ledger-empty', () => {
    assert.equal(refusedBy(buildHandoffContent(inputOf(taskOf([], [closedFact('c1', 'next', 'stale plan', NOW - CLOSED_SHOWN_MS - 1)])))), 'ledger-empty');
});
