// Items shaped like the ones a real database holds (the words are made up), through every gate: what the gates must refuse, flag and let through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomesOf } from '#src/recap/domain/gates/index.ts';
import type { GatedSection, Item } from '#src/recap/domain/gates/index.ts';

const CONTEXT = { language: 'en', agents: ['a1', 'a2', 'claude', 'codex'], earlier: [] as readonly Item[] };

/** `refuse:G1` / `flag:G8` for each outcome, in order; empty for an item that passes. */
const verdictOf = (section: GatedSection, text: string, earlier: readonly Item[] = []): string[] =>
    outcomesOf({ task: 't1', section, position: 0, text }, { ...CONTEXT, earlier }).map((outcome) => `${outcome.kind}:${outcome.gate}`);

const REFUSED: readonly (readonly [GatedSection, string, string])[] = [
    ['done', 'claude: Updated notes/plan.md with DONE status and removed both worktrees.', 'refuse:G1'],
    ['done', 'a1 pushed the branch and checked the pipeline.', 'refuse:G1'],
    ['now', 'Claude is waiting for the first metric.', 'refuse:G1'],
    ['now', 'The agent is checking the compaction records.', 'refuse:G1'],
    ['next', 'claude: Continue census collection through Oct 13.', 'refuse:G1'],
    ['decisions', 'Leave the unrelated db-1 tab alone.', 'refuse:G3'],
    ['decisions', 'Keep Zigbee-style retries at three; consider five if errors persist.', 'refuse:G3'],
    ['decisions', 'Bring PR #1 in as one merge request; close the old PR after it lands.', 'refuse:G3'],
    ['links', 'New tab db-1 is unrelated.', 'refuse:G4'],
    ['links', 'Herdr tab w17; claude agent review-sources.', 'refuse:G4'],
    ['links', 'ctx1', 'refuse:G4'],
];

const PASSED: readonly (readonly [GatedSection, string])[] = [
    ['done', 'Both pipelines for !256 and !16 are green.'],
    ['done', '07:40 — Host db-1 reached 95 °C under load, averaging 3.3 GHz.'],
    ['now', 'a1: waiting for the EXP-009 readout, expected in a few hours.'],
    ['now', 'Node w2 is Ready; node w3 has not rejoined.'],
    ['next', 'Merge the release into the release branch, run the gates and push.'],
    ['needs', 'Choose whether to wait for 20 explicit signals or rerun F6 using file touches.'],
    ['decisions', 'Frozen EXP-009 uses pinned code, so merging !251 does not affect steps 2–3.'],
    ['decisions', 'Pass low reasoning effort to Codex by default and make it configurable.'],
    ['decisions', 'Keep the sections frozen because reviewers compare runs: log changes in the deviation log.'],
    ['decisions', 'Hermes session-ending failures never block reviews because the cleanup loop is bounded.'],
    ['rules', 'Tab-recap must ship everything it needs and depend on nothing external.'],
    ['links', 'MR !252 at fd8db19'],
    ['links', 'feat/tab-recap-judge'],
    ['links', 'main'],
    ['links', '`schema/recap-input.dtd`'],
    ['links', 'https://docs.example.org/compaction-on-demand'],
];

test('what a real writer wrote and the gates must refuse: the narrator, a decision with no reason, a link that is a description', () => {
    for (const [section, text, expected] of REFUSED) {
        assert.ok(verdictOf(section, text).includes(expected), `${section}: ${text} → ${verdictOf(section, text).join(', ')}`);
    }
});

test('what a real writer wrote and must pass untouched, including the words that look like a narrator or a missing reason but are not', () => {
    for (const [section, text] of PASSED) {
        assert.deepEqual(verdictOf(section, text).filter((outcome) => outcome.startsWith('refuse')), [], `${section}: ${text}`);
    }
});

test('flags never refuse: nothing concrete and a pronoun opener are counted and kept', () => {
    assert.deepEqual(verdictOf('next', 'Improve the settings.'), ['flag:G8']);
    assert.deepEqual(verdictOf('done', 'It still fails on the second run.'), ['flag:G8', 'flag:G9']);
    assert.deepEqual(verdictOf('next', 'Run `bash ci/test.sh` on feat/retry.'), []);
});

test('a duplicate of an earlier item of the task is refused, the first one is kept', () => {
    const kept: Item = { task: 't1', section: 'next', position: 0, text: 'Start step 4 only after its own freeze and the gauge below 50%.' };
    assert.deepEqual(verdictOf('next', 'Wait for the gauge below 50% and start step 4 after its own freeze.', [kept]), ['refuse:G2']);
    assert.deepEqual(verdictOf('next', 'Rotate the signing key.', [kept]), ['flag:G8']);
});
