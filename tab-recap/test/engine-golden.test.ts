import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden, matches } from '#test/e2e/support/replay-world.ts';

test('the golden bytes are taken in UTC, the zone bun test runs in, so the local times in the documents do not move between machines', () => {
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC');
});

test('golden: the six-turn replay on the single-call pipeline hands the writer the same documents and leaves the same ledger and runs', async () => {
    const text = await golden(undefined);
    assert.ok(text.includes('=== writer input 6'), 'every turn reaches the writer');
    matches('engine-golden-one.txt', text);
});

test('golden: the six-turn replay on the full pipeline enumerates every turn, hands the writer the same documents and leaves the same ledger and runs', async () => {
    const text = await golden('full');
    assert.ok(text.includes('=== enumeration input 6'), 'every turn is enumerated');
    matches('engine-golden-full.txt', text);
});

test('golden: two replays of the same transcript give the same bytes', async () => {
    assert.equal(await golden('full'), await golden('full'));
});
