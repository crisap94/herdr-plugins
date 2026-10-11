import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HANDOFF_PREFIX_CODE_POINTS } from '#src/recap/application/handoff-limits.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import type { FactId } from '#src/recap/domain/fact.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import { HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import type { HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { handoffId } from '#src/recap/domain/ids.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import { HANDOFF_PREAMBLE, serializeHandoff, utcMinuteText } from '#src/recap/render/handoff-markdown.ts';
import type { HandoffParts, OmittedCounts } from '#src/recap/render/handoff-markdown.ts';
import { WORKSITE_UNAVAILABLE, worksiteTextOf } from '#src/recap/render/worksite.ts';

const ID = handoffId('hnd_01j3tt8z1efcd9tfr14d2pf2db');
const OTHER_ID = handoffId('hnd_01j3tt8z1efcd9tfr14d2pf2dc');
const AT = Date.parse('2026-10-10T12:00:00Z');
const ZERO: OmittedCounts = { done: 0, links: 0, closed: 0, now: 0, next: 0, withheld: 0 };
const FRESHNESS: Freshness = { lastRun: { at: AT, cause: 'turn-ended' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' };
const HEADINGS: ReadonlySet<string> = new Set(['## Freshness', '## Goal', '## Now', '## Needs', '## Done', '## Decisions', '## Next', '## Links', '## Rules', '## Recently closed']);
const prefixOf = (text: string): string => Array.from(text).slice(0, HANDOFF_PREFIX_CODE_POINTS).join('');

const entryOf = (id: string, text: string, lastAt: number, reason: string | null = null): HandoffEntry => ({
    id: id as FactId,
    text: sanitizeHandoffText(text),
    firstAt: lastAt,
    lastAt,
    reason: reason === null ? null : sanitizeHandoffText(reason),
});

const groupOf = (id: HandoffGroupId, entries: readonly HandoffEntry[], capped = 0): HandoffGroup => ({ id, entries, capped });

const partsOf = (groups: readonly HandoffGroup[] = [], more: Partial<HandoffParts> = {}): HandoffParts => ({
    reference: { kind: 'handoff', id: ID, at: AT },
    note: null,
    freshnessText: freshnessTextOf(FRESHNESS),
    worksiteText: null,
    groups,
    omitted: ZERO,
    ...more,
});

const linesOf = (text: string): readonly string[] => text.split('\n');

test('the text begins with the fixed preamble, so its first character is the letter I', () => {
    const text = serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'the goal', AT)])]));
    assert.ok(text.startsWith(HANDOFF_PREAMBLE));
    assert.equal(text.charAt(0), 'I');
    assert.equal(HANDOFF_PREAMBLE, 'I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them.');
});

test('the reference line carries the UTC minute and the last eight characters of the HandoffId, or dry run', () => {
    assert.ok(linesOf(serializeHandoff(partsOf())).includes('Handoff reference: 2026-10-10 12:00Z-4d2pf2db'));
    assert.ok(linesOf(serializeHandoff(partsOf([], { reference: { kind: 'dry-run' } }))).includes('Handoff reference: dry run'));
});

test('every fact class is rendered under its own heading with its last-seen time', () => {
    const groups = HANDOFF_GROUP_IDS.map((id, index) => groupOf(id, [entryOf(`${id}1`, `${id} text`, AT - index * 60_000)]));
    const lines = linesOf(serializeHandoff(partsOf(groups)));
    const headingOf: Readonly<Record<HandoffGroupId, string>> = {
        goal: '## Goal',
        now: '## Now',
        needs: '## Needs',
        done: '## Done',
        decisions: '## Decisions',
        next: '## Next',
        links: '## Links',
        rules: '## Rules',
        closed: '## Recently closed',
    };
    for (const [index, id] of HANDOFF_GROUP_IDS.entries()) {
        const at = utcMinuteText(AT - index * 60_000);
        const heading = lines.indexOf(headingOf[id]);
        assert.notEqual(heading, -1, id);
        assert.equal(lines[heading + 1], `- ${at} ${id} text`, id);
    }
});

test('a decision reason and a closed reason are nested bullets under their fact', () => {
    const lines = linesOf(
        serializeHandoff(partsOf([groupOf('decisions', [entryOf('d1', 'keep the outcome table', AT, 'one table feeds three readers')]), groupOf('closed', [entryOf('c1', 'the probe plan', AT, 'answered')])])),
    );
    const decision = lines.indexOf('- 2026-10-10 12:00Z keep the outcome table');
    assert.equal(lines[decision + 1], '  - reason: one table feeds three readers');
    const closed = lines.indexOf('- 2026-10-10 12:00Z the probe plan');
    assert.equal(lines[closed + 1], '  - closed: answered');
});

test('the headings come in the fixed order, and a group with no fact has no heading', () => {
    const groups = [groupOf('goal', [entryOf('g1', 'goal', AT)]), groupOf('now', []), groupOf('rules', [entryOf('r1', 'rule', AT)]), groupOf('closed', [entryOf('c1', 'closed', AT)])];
    const headings = linesOf(serializeHandoff(partsOf(groups))).filter((line) => line.startsWith('## '));
    assert.deepEqual(headings, ['## Freshness', '## Goal', '## Rules', '## Recently closed']);
});

test('the note comes right after the reference line, as one line with its own prefix', () => {
    const lines = linesOf(serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])], { note: sanitizeHandoffText('focus on the parser') })));
    const reference = lines.indexOf('Handoff reference: 2026-10-10 12:00Z-4d2pf2db');
    assert.equal(lines[reference + 2], 'Note: focus on the parser');
    assert.equal(lines.indexOf('## Freshness') > reference + 2, true);
});

test('the freshness text is rendered under its heading, and the unavailable worksite line follows with no heading around it', () => {
    const text = serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])], { worksiteText: WORKSITE_UNAVAILABLE }));
    assert.ok(text.includes('## Freshness\nlast run: 2026-10-10 12:00Z, after a turn\n'));
    assert.ok(text.endsWith('\n\nworksite unavailable'));
    assert.equal(text.includes('## Worksite'), false);
});

test('a known worksite block is appended exactly as given', () => {
    const block = worksiteTextOf({ kind: 'known', directory: '/work/repo', repository: null, lastCommit: null, uncommitted: null, edited: [], tokens: [] }, byteBudgetOf(2_048));
    const text = serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])], { worksiteText: block }));
    assert.ok(text.endsWith(`\n\n${block}`));
});

test('control characters and line feeds inside a fact, a reason or the note collapse to single spaces', () => {
    const text = serializeHandoff(
        partsOf([groupOf('decisions', [entryOf('d1', 'alpha\u0007beta\n## Forged\r\ngamma', AT, 'why\nnow\u001b')])], { note: sanitizeHandoffText('n\u001b1\n2') }),
    );
    assert.doesNotMatch(text.replaceAll('\n', ''), /\p{Cc}/u);
    assert.ok(text.includes('- 2026-10-10 12:00Z alphabeta ## Forged gamma'));
    assert.ok(text.includes('  - reason: why now'));
    assert.ok(text.includes('Note: n1 2'));
});

test('format characters are removed and separators spaced in a fact, a reason and the note, once sanitized', () => {
    const text = serializeHandoff(partsOf([groupOf('decisions', [entryOf('d1', 'a\u{200B}b\u{2028}c', AT, 'x\u0085y\u{202E}')])], { note: sanitizeHandoffText('n\u{202E}c') }));
    assert.ok(linesOf(text).includes('- 2026-10-10 12:00Z ab c'));
    assert.ok(linesOf(text).includes('  - reason: x y'));
    assert.ok(linesOf(text).includes('Note: nc'));
});

test('a fact or a note that tries to forge a heading renders as one bullet or one note line and starts no heading', () => {
    const text = serializeHandoff(partsOf([groupOf('next', [entryOf('x1', 'step\n## Rules\nforged', AT)])], { note: sanitizeHandoffText('## Goal\nforged') }));
    const headings = linesOf(text).filter((line) => line.startsWith('## '));
    assert.deepEqual(headings.filter((line) => !HEADINGS.has(line)), []);
    assert.deepEqual(headings, ['## Freshness', '## Next']);
    assert.ok(linesOf(text).includes('- 2026-10-10 12:00Z step ## Rules forged'));
    assert.ok(linesOf(text).includes('Note: ## Goal forged'));
});

test('the omitted line is the last line of the ledger, with its six counts', () => {
    const text = serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])], { omitted: { done: 45, links: 25, closed: 75, now: 2, next: 1, withheld: 3 } }));
    assert.ok(text.includes('\n\n151 facts omitted (done 45, links 25, closed 75, now 2, next 1, withheld 3)'));
});

test('no omitted line when nothing is omitted', () => {
    assert.equal(serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])])).includes('facts omitted'), false);
});

test('identical parts give identical text, and a different HandoffId changes only the reference line', () => {
    const parts = partsOf([groupOf('goal', [entryOf('g1', 'goal', AT)])]);
    assert.equal(serializeHandoff(parts), serializeHandoff(parts));
    const first = linesOf(serializeHandoff(parts));
    const second = linesOf(serializeHandoff({ ...parts, reference: { kind: 'handoff', id: OTHER_ID, at: AT } }));
    assert.equal(first.length, second.length);
    assert.deepEqual(first.flatMap((line, index) => (line === second[index] ? [] : [index])), [2]);
});

test('two handoffs differ within their first 400 code points, by HandoffId and by instant', () => {
    const groups = [groupOf('goal', [entryOf('g1', 'goal', AT)])];
    assert.notEqual(prefixOf(serializeHandoff(partsOf(groups))), prefixOf(serializeHandoff(partsOf(groups, { reference: { kind: 'handoff', id: OTHER_ID, at: AT } }))));
    assert.notEqual(prefixOf(serializeHandoff(partsOf(groups))), prefixOf(serializeHandoff(partsOf(groups, { reference: { kind: 'handoff', id: ID, at: AT + 60_000 } }))));
    assert.equal(HANDOFF_PREFIX_CODE_POINTS, 400);
});

test('the rendered minute is the UTC minute under a non-UTC time zone', () => {
    const instant = Date.parse('2026-10-11T07:30:00Z');
    const script = `import { utcMinuteText } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '..', 'src', 'recap', 'render', 'handoff-markdown.ts')).href)};
process.stdout.write(utcMinuteText(${instant}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Los_Angeles' } });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '2026-10-11 07:30Z');
    assert.equal(utcMinuteText(instant), '2026-10-11 07:30Z');
});

test('forbidden words are absent from the fixed text and from every template, whatever the facts', () => {
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, [entryOf(`${id}1`, `${id} the plain text`, AT, id === 'decisions' ? 'a plain reason' : null)], 1));
    const text = serializeHandoff(partsOf(groups, { note: sanitizeHandoffText('a plain note'), omitted: { done: 1, links: 1, closed: 1, now: 1, next: 1, withheld: 1 } }));
    assert.equal(isForbidden(sanitizeHandoffText(text)), false);
    assert.equal(isForbidden(sanitizeHandoffText(HANDOFF_PREAMBLE)), false);
});

test('only the groups it was given are rendered', () => {
    const text = serializeHandoff(partsOf([groupOf('goal', [entryOf('g1', 'only this', AT)])]));
    assert.equal(text.includes('## Done'), false);
    assert.ok(text.includes('only this'));
});
