import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { importedChapters } from '#src/adapters/db/imported-chapters.ts';
import { scratchDir } from '#test/db/support.ts';
import { liveDatabase, MIN, T0 } from './imported-fixture.ts';

test('the last good 1.x recap of each chapter: the newest run without an error that has items, its items keyed state/<task>/<section>/<position>', () => {
    const dir = scratchDir('imported-chapters');
    try {
        const path = join(dir, 'tab-recap.db');
        liveDatabase(path);
        const chapters = importedChapters(path, 'w1:t1');
        assert.deepEqual(chapters?.map((chapter) => [chapter.n, chapter.at - T0, chapter.items.map((item) => `${item.key} ${item.text}`)]), [
            [1, 20 * MIN, ['state/t1/goal/0 Add a cart to the shop', 'state/t1/done/0 Cart model written in src/cart.ts', 'state/t1/next/0 Add totals']],
            [2, 50 * MIN, ['state/t1/goal/0 Ship the cart', 'state/t1/done/0 Totals added in src/totals.ts']],
        ]);
        assert.deepEqual(importedChapters(path, 'w1:t9'), [], 'a tab with no chapters');
        assert.equal(importedChapters(join(dir, 'missing.db'), 'w1:t1'), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
