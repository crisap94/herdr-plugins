import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '#test/db/support.ts';
import { GitLaneRepo, ORIGIN_ARGS, ROOT_ARGS } from '#src/adapters/git-lane-repo.ts';
import type { Runner, RunResult } from '#src/adapters/process.ts';
import { en } from '#src/i18n/en.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { LaneWeb, TabLane, TabView } from '#src/ports/tab-views.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { hyperlink } from '#src/recap/render/hyperlink.ts';
import { present } from '#src/recap/render/present.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { plain, visibleLength, wrap } from '#src/recap/render/wrap.ts';
import { oneTask } from '#test/support.ts';

const E = String.fromCodePoint(0x1b);
const open = (url: string): string => `${E}]8;;${url}${E}\\`;
const CLOSE = `${E}]8;;${E}\\`;
const BASE = 'https://gitlab.example/acme/shop';
const noGlow = (): null => null;

const lane = (pane: string, web: LaneWeb | null): TabLane => ({ pane, agent: 'claude', status: 'idle', title: pane, cwd: '/w', web });
const viewOf = (sections: Partial<RecapSections>, lanes: readonly TabLane[], style?: ColumnView['style']): ColumnView => ({
    tab: { tab: 'w1:t1', column: null, at: 0, lanes },
    recap: { ...blankRecap('w1:t1'), tasks: oneTask('', { ...NO_SECTIONS, ...sections }, lanes.map((each) => each.pane)), at: 0 },
    notes: new Map(), warnings: [], now: 0, messages: en, ...(style === undefined ? {} : { style }),
});
const web = { base: BASE, forge: 'gitlab', branch: 'feat/cart' } as const;
const drawn = (view: ColumnView, width = 60): string[] => present(view, width, noGlow);

test('golden: a recap with a merge request, a commit, a file and a URL draws OSC 8 links around the names and keeps the words', () => {
    const lines = drawn(viewOf({ done: ['!252 merged in a1b2c3d4'], links: ['`src/cart.ts`', 'https://example.org/docs'] }, [lane('w1:p1', web)]));
    const text = lines.join('\n');
    assert.ok(text.includes(`• ${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE} merged in ${open(`${BASE}/-/commit/a1b2c3d4`)}a1b2c3d4${CLOSE}`));
    assert.ok(text.includes(`• ${open(`${BASE}/-/blob/feat/cart/src/cart.ts`)}src/cart.ts${CLOSE}`));
    assert.ok(text.includes(`• ${open('https://example.org/docs')}https://example.org/docs${CLOSE}`));
    assert.ok(!text.includes('`'), 'the backticks are gone');
});

test('links take no cells: the column is as wide with them as without', () => {
    const lane1 = lane('w1:p1', web);
    const sections = { done: ['!252 merged in a1b2c3d4, then `src/cart.ts` changed'] };
    const [linkedLines, plainLines] = [drawn(viewOf(sections, [lane1])), drawn(viewOf(sections, [{ ...lane1, web: null }]))];
    assert.deepEqual(linkedLines.map(visibleLength), plainLines.map(visibleLength));
    assert.ok(linkedLines.length > 0 && linkedLines.every((line) => visibleLength(line) <= 60));
});

test('NO_COLOR keeps the links', () => {
    const text = drawn(viewOf({ done: ['!252 merged'] }, [lane('w1:p1', web)], plain)).join('\n');
    assert.ok(text.includes(`${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE}`));
    assert.ok(!text.includes(`${E}[`), 'and nothing else is escaped');
});

test('a link that wraps stays a link on every line, to the same address, and no line is wider than the column', () => {
    const url = 'https://example.org/a/very/long/path/that/cannot/fit/on/one/line';
    const lines = drawn(viewOf({ links: [url] }, [lane('w1:p1', null)]), 20).filter((line) => line.includes(url.slice(0, 12)) || line.includes('line'));
    const pieces = lines.filter((line) => line.includes(`${E}]8;;`));
    assert.ok(pieces.length >= 3, 'wrapped over several lines');
    for (const line of pieces) {
        assert.ok(visibleLength(line) <= 20, line);
        assert.ok(line.includes(open(url)) && line.trimEnd().endsWith(CLOSE), `opened and closed on its own line: ${JSON.stringify(line)}`);
    }
    assert.equal(pieces.map((line) => line.replaceAll(open(url), '').replaceAll(CLOSE, '').replace(/^\s*•?\s*/u, '').trim()).join(''), url);
});

test('a wrapped word that holds a link and plain text reopens only the link', () => {
    const word = `(${hyperlink('0123456789abcdefghij', 'https://x.example/a')}).`;
    const lines = wrap(word, 8);
    assert.ok(lines.every((line) => visibleLength(line) <= 8));
    assert.equal(lines.map((line) => line.replaceAll(open('https://x.example/a'), '').replaceAll(CLOSE, '')).join(''), '(0123456789abcdefghij).');
    for (const line of lines) {
        const [opens, closes] = [line.split(open('https://x.example/a')).length - 1, line.split(CLOSE).length - 1];
        assert.equal(opens, closes, `balanced: ${JSON.stringify(line)}`);
    }
    assert.ok(lines.at(-1)?.endsWith(').'), 'the punctuation after the link is plain');
});

test('control characters never reach a terminal inside a URL: such a reference is plain text', () => {
    for (const url of [`https://x.example/${E}]52;c;AAAA`, 'https://x.example/a\u0007b', 'https://x.example/a\u009cb']) {
        assert.equal(hyperlink('x', url), 'x');
    }
    assert.equal(hyperlink('x', 'https://x.example/ok'), `${open('https://x.example/ok')}x${CLOSE}`);
    const lines = drawn(viewOf({ links: [`https://x.example/a${E}b`] }, [lane('w1:p1', web)]));
    const urls = [...lines.join('\n').matchAll(new RegExp(`${E}\\]8;;([^${E}]+)${E}\\\\`, 'gu'))].map((found) => found[1]);
    assert.deepEqual(urls, ['https://x.example/a'], 'the URL ends where the control character starts');
});

test('two repositories in one task: only full URLs are linked; one repository: the number links', () => {
    const other = { ...web, base: 'https://gitlab.example/acme/other' };
    const sections = { done: ['!7 merged', 'see https://example.org/x'] };
    const mixed = drawn(viewOf(sections, [lane('w1:p1', web), lane('w1:p2', other)])).join('\n');
    assert.ok(!mixed.includes(open(`${BASE}/-/merge_requests/7`)));
    assert.ok(mixed.includes(open('https://example.org/x')));
    assert.ok(drawn(viewOf(sections, [lane('w1:p1', web), lane('w1:p2', { ...web, branch: 'main' })])).join('\n').includes(open(`${BASE}/-/merge_requests/7`)));
});

test('a remote with a token: nothing stored and nothing drawn holds the secret (remote → port → database → column)', async () => {
    const answers = new Map<readonly string[], string>([[ROOT_ARGS, '/w/shop\n'], [ORIGIN_ARGS, 'https://oauth2:s3cr3t-token@gitlab.example/acme/shop.git\n']]);
    const runner: Runner = (_command, args): Promise<RunResult> => Promise.resolve({ code: 0, stdout: answers.get(args) ?? 'feat/cart\n', stderr: '', timedOut: false });
    const webs = new LaneWebs(new GitLaneRepo({ now: (): Instant => instant(0) }, runner));
    await webs.refresh(laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd: '/w/shop' }));
    const { views, db } = memoryStore();
    const view: TabView = { tab: 'w1:t1', column: null, at: 1, lanes: [lane('w1:p1', webs.of('w1:p1'))] };
    views.writeTab(view);
    const stored = JSON.stringify(db.prepare('SELECT * FROM lane').all());
    assert.ok(stored.includes(BASE) && !stored.includes('s3cr3t') && !stored.includes('oauth2'), stored);
    const read = views.readTab('w1:t1');
    assert.ok(read !== null);
    const text = drawn({ ...viewOf({ done: ['!3 merged', '`src/a.ts` in a1b2c3d4'] }, read.lanes) }).join('\n');
    assert.ok(text.includes(open(`${BASE}/-/merge_requests/3`)));
    assert.ok(!text.includes('s3cr3t') && !text.includes('oauth2'));
});

test('a flagged link (a description where a reference belongs) is kept and drawn as plain text, with no hyperlink', () => {
    const text = drawn(viewOf({ links: ['the release notes', 'ctx1', '!252'] }, [lane('w1:p1', web)])).join('\n');
    assert.ok(text.includes('• the release notes') && text.includes('• ctx1'), 'the fact is still there');
    assert.ok(text.includes(`• ${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE}`), 'a real reference beside it is a link');
    assert.equal((text.match(/\]8;;https?:/g) ?? []).length, 1, 'exactly one hyperlink: the description opens none');
});
