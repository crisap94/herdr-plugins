import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API, DOC_VERSIONS, LONG_POLL, ROUTE } from 'herdr-desktop-mods/tab-recap/contract';
import { ROUTES } from '#src/adapters/desktop/api/routes.ts';
import { API_HEALTH_PATH, API_HOST, API_POLL_DEFAULT_S, API_VERSION } from '#src/adapters/desktop/constants.ts';
import { GuiPublisher } from '#src/adapters/desktop/publisher.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { tabId } from '#test/support/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { blankRecap, type RecapRecords } from '#src/ports/recap-records.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';

const SAMPLE_TAB = 'w1';
const SAMPLE_NEED = 'n1';

const records: RecapRecords = {
    readRecap: (tab) => blankRecap(tab),
    lastRunOf: () => null,
    beginRun: () => undefined,
    recordRun: () => undefined,
    failRun: () => undefined,
    advance: () => undefined,
};

const views: TabViewStore = {
    readTab: () => null,
    writeTab: () => undefined,
    tabOf: () => null,
};

test('the desktop contract names the API version, origin, health path and poll wait the host serves', () => {
    assert.equal(API.version, API_VERSION);
    assert.equal(API.origin, `http://${API_HOST}`);
    assert.equal(ROUTE.health, API_HEALTH_PATH);
    assert.equal(LONG_POLL.wait, API_POLL_DEFAULT_S);
});

test('every route the desktop client builds matches exactly one host route', () => {
    const paths: string[] = [
        ROUTE.health,
        ROUTE.index,
        ROUTE.events,
        `${ROUTE.tabs}${SAMPLE_TAB}`,
        `${ROUTE.tabs}${SAMPLE_TAB}${ROUTE.refresh}`,
        `${ROUTE.tabs}${SAMPLE_TAB}${ROUTE.open}`,
        `${ROUTE.tabs}${SAMPLE_TAB}${ROUTE.needs}${SAMPLE_NEED}${ROUTE.answer}`,
        `${ROUTE.tabs}${SAMPLE_TAB}${ROUTE.compact}`,
        `${ROUTE.tabs}${SAMPLE_TAB}${ROUTE.handoff}`,
    ];
    for (const path of paths) {
        const matches = ROUTES.filter((route): boolean => route.pattern.test(path));
        assert.equal(matches.length, 1, `${path} matches ${matches.length} routes`);
    }
});

test('a document the host publishes carries a version the desktop client accepts', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'host-d2-'))));
    const publisher = new GuiPublisher({ dir, records, views, now: (): Instant => instant(100), log: (): void => undefined });
    publisher.publish(tabId(SAMPLE_TAB));
    const index: { version: number; tabs: { tab: string }[] } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(index.tabs.map((row) => row.tab), [SAMPLE_TAB]);
    assert.ok(DOC_VERSIONS.includes(index.version));
});
