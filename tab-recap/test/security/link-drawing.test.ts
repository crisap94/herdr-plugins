import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '#test/db/support.ts';
import { addRemote } from 'isomorphic-git';
import { promises as fsp } from 'node:fs';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { en } from '#src/i18n/en.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { blankRecap } from '@stateforge-labs/session-ledger';
import type { TabLaneRecord, TabViewRecord } from '#src/ports/tab-views.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { hyperlink } from '@stateforge-labs/recap-view/unstable/hyperlink.ts';
import { present } from '#src/view-model/present.ts';
import type { ColumnView } from '#src/view-model/present.ts';
import { oneTask } from '#test/support.ts';
import { makeRepo } from '#test/fixtures/git-repo.ts';
import { tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';
import { laneRecord, viewRecord } from '#test/support/tab-view-records.ts';

const E = String.fromCodePoint(0x1b);
const open = (url: string): string => `${E}]8;;${url}${E}\\`;
const CLOSE = `${E}]8;;${E}\\`;
const BASE = 'https://gitlab.example/acme/shop';
const noGlow = (): null => null;

const lane = (pane: string, web: object | null): TabLaneRecord => laneRecord({ pane, agent: 'claude', status: 'idle', title: pane, cwd: '/w', web });
const viewOf = (sections: Partial<RecapSections>, lanes: readonly TabLaneRecord[], style?: ColumnView['style']): ColumnView => ({
    tab: viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes }),
    recap: { ...blankRecap(tabId('w1:t1')), tasks: oneTask('', { ...NO_SECTIONS, ...sections }, lanes.map((each) => each.pane)), at: instant(0) },
    notes: new Map(), warnings: [], now: 0, messages: en, ...(style === undefined ? {} : { style }),
});
const web = { base: BASE, forge: 'gitlab', branch: 'feat/cart' } as const;
const drawn = (view: ColumnView, width = 60): string[] => present(view, width, noGlow);

test('control characters never reach a terminal inside a URL: such a reference is plain text', () => {
    for (const url of [`https://x.example/${E}]52;c;AAAA`, 'https://x.example/a\u0007b', 'https://x.example/a\u009cb']) {
        assert.equal(hyperlink('x', url), 'x');
    }
    assert.equal(hyperlink('x', 'https://x.example/ok'), `${open('https://x.example/ok')}x${CLOSE}`);
    const lines = drawn(viewOf({ links: [textOf(`https://x.example/a${E}b`)] }, [lane('w1:p1', web)]));
    const urls = [...lines.join('\n').matchAll(new RegExp(`${E}\\]8;;([^${E}]+)${E}\\\\`, 'gu'))].map((found) => found[1]);
    assert.deepEqual(urls, ['https://x.example/a'], 'the URL ends where the control character starts');
});

test('a remote with a token: nothing stored and nothing drawn holds the secret (remote → port → database → column)', async () => {
    const shop = await makeRepo('link-token-', { 'a.txt': 'x\n' });
    try {
        await addRemote({ fs: { promises: fsp }, dir: shop.root, remote: 'origin', url: 'https://oauth2:s3cr3t-token@gitlab.example/acme/shop.git' });
        const webs = new LaneWebs(new GitLaneRepo({ now: (): Instant => instant(0) }));
        await webs.refresh(laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd: shop.root })));
        const { views, db } = memoryStore();
        const view: TabViewRecord = viewRecord({ tab: 'w1:t1', column: null, at: 1, lanes: [lane('w1:p1', webs.of(paneId('w1:p1')))] });
        views.writeTab(view);
        const stored = JSON.stringify(db.prepare('SELECT * FROM lane').all());
        assert.ok(stored.includes(BASE) && !stored.includes('s3cr3t') && !stored.includes('oauth2'), stored);
        const read = views.readTab(tabId('w1:t1'));
        assert.ok(read !== null);
        const text = drawn({ ...viewOf({ done: [textOf('!3 merged'), textOf('`src/a.ts` in a1b2c3d4')] }, read.lanes) }).join('\n');
        assert.ok(text.includes(open(`${BASE}/-/merge_requests/3`)));
        assert.ok(!text.includes('s3cr3t') && !text.includes('oauth2'));
    } finally {
        shop.clean();
    }
});
