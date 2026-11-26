import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { causeOf, exitCodeOf, instant, must, parseText, textOf, unknown, usdOf } from '@stateforge-labs/session-ledger';
import type { Curated, Curators, Text } from '@stateforge-labs/session-ledger';
import { curationOf } from '#src/daemon/curate.ts';
import { cursor, recordOps } from '#test/db/support.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { configText, seedConfig, viewWorld, withWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { HOUR, MIN, NOW, showTab, VERSION } from '../support/view-seeds.ts';
import { ledgerWorld, type LedgerWorld } from '../support/ledger-world.ts';

const ENV = ['TAB_RECAP_RECONCILE_EVERY', 'TAB_RECAP_CURATOR_REPAIR'] as const;
const QUESTION = 'Cookie or account for guest baskets?';
const ANSWER = 'cookie is fine';
const FIRST = 'Cart tests pass';
const SECOND = 'The cart test suite is green';
const STORY = 'The cart is built and its tests pass; guests keep their basket in a cookie.';

const said = (body: object): Curated => ({ kind: 'curated', text: textOf(JSON.stringify(body)) });
const words = (count: number): string => Array.from({ length: count }, (_, at) => `w${at}`).join(' ');
type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
const none = (): Curated => NONE;
const NONE: Curated = unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf(textOf('the curator exited')) });

const idOf = (document: string, text: string): string => {
    const found = new RegExp(`<fact id="(f\\d+)"[^>]*>${text}`, 'u').exec(document);
    assert.ok(found !== null, `the document names the fact ${text}`);
    return found[1] ?? '';
};
const typed = async (pane: Pane, keys: readonly string[]): Promise<void> => {
    for (const key of keys) {
        await pane.press(key);
    }
};
const down = (count: number): string[] => Array.from({ length: count }, () => 'j');
const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION, agents: ['claude', 'codex'] }, use);
const opened = async (world: ViewWorld, env: Readonly<Record<string, string>> = {}): Promise<Pane> => {
    const pane = await world.settings({ cols: 110, rows: 60, env });
    await pane.painted((screen) => /● claude/.test(screen.text), 'the settings found the agents');
    return pane;
};

describe('the curator is turned on', () => {
    const saved = new Map<string, string | undefined>();
    let view: ViewWorld;
    let world: LedgerWorld;
    let on = false;
    let answer: (document: string) => Curated = none;
    const calls: { readonly document: string; readonly mode: string | undefined }[] = [];
    const logs: string[] = [];
    const pending: Promise<void>[] = [];
    let curation: ReturnType<typeof curationOf>;

    const stateOf = (text: string): readonly unknown[] => {
        const row = world.rows(`SELECT state, closed_why FROM fact WHERE text = '${text}'`)[0];
        return [row?.['state'], row?.['closed_why']];
    };
    const story = (): string | null => view.store.stories.read(tabId('w1:t1'), textOf('t1'))?.text ?? null;
    const settle = async (): Promise<void> => { await Promise.all(pending.splice(0)); };
    const touch = (texts: readonly string[], section: Section = 'next'): void => {
        recordOps(view.store, { scope: tabId('w1:t1'), at: instant(world.clock.now + 1), cause: 'turn-ended', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneId('w1:p1')] }], ops: [{ task: textOf('t1'), ops: texts.map((text) => ({ op: 'add' as const, section, text: textOf(text), why: null, ref: null, at: null, agent: null })) }] });
    };
    const ask = async (): Promise<void> => {
        world.clock.now += 10 * MIN;
        await curation.request(world.scope);
    };

    const curator: Curators = {
        backend: must(parseText('fake/test')),
        write: (document, mode) => {
            calls.push({ document, mode });
            return Promise.resolve(answer(document));
        },
    };

    before(async () => {
        view = await viewWorld({ now: NOW, version: VERSION });
        for (const key of ENV) {
            saved.set(key, process.env[key]);
        }
        process.env['TAB_RECAP_RECONCILE_EVERY'] = '1';
        delete process.env['TAB_RECAP_CURATOR_REPAIR'];
        world = ledgerWorld({ lanes: [{ pane: 'w1:p1' }], store: view.store, now: NOW - 6 * HOUR, ran: (event) => { pending.push(curation.afterRun(world.scope, event)); } });
        curation = curationOf({ store: view.store, curator: () => (on ? curator : null), transcripts: world.transcripts, clock: { now: () => instant(world.clock.now) }, log: (line: Text) => { logs.push(String(line)); } });
        showTab(view, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator' }]);
    });

    after(async () => {
        world.close();
        await view.close();
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    test('with the curator off a run asks nothing of it', { timeout: 30_000 }, async () => {
        world.grow('w1:p1', 5);
        world.script({ kind: 'ops', ops: [
            { op: 'add', section: 'needs', text: QUESTION, anchor: 'That needs your call: cookie or account?' },
            { op: 'add', section: 'now', text: FIRST, anchor: 'the cart tests pass' },
            { op: 'add', section: 'now', text: SECOND, anchor: 'the cart tests pass' },
        ] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
        await settle();
        assert.equal(calls.length, 0);
        assert.deepEqual([stateOf(QUESTION), stateOf(FIRST), stateOf(SECOND)], [['open', null], ['open', null], ['open', null]]);
    });

    test('with it on, the run after the operator answered makes the curator reconcile: the question is closed as answered on the quote of the reply', { timeout: 30_000 }, async () => {
        on = true;
        answer = (document: string): Curated => said({ ops: [{ op: 'close', id: idOf(document, QUESTION), why: 'answered', evidence: ANSWER }] });
        world.clock.now += 10 * MIN;
        world.grow('w1:p1', 1);
        world.script({ kind: 'ops', ops: [] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
        await world.until(() => calls.length > 0, 'the curator reconciles after the run');
        await settle();
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.mode, 'reconcile');
        const [first] = calls;
        const sent = first.document;
        assert.ok(sent.includes(ANSWER) && sent.includes(QUESTION));
        assert.deepEqual(stateOf(QUESTION), ['closed', 'answered']);
    });

    test('asked for the story, the curator merges the duplicate fact and the paragraph is stored with the run time; an add and an update are refused and logged', { timeout: 30_000 }, async () => {
        const count = (): unknown => world.rows('SELECT COUNT(*) AS n FROM fact')[0]?.['n'];
        const seen = count();
        answer = (document: string): Curated => said({ ops: [
            { op: 'add', section: 'done', text: 'invented', why: null, ref: null, at: null, agent: null },
            { op: 'update', id: idOf(document, FIRST), text: 'rewritten' },
            { op: 'close', id: idOf(document, SECOND), why: 'merged', into: idOf(document, FIRST) },
        ], story: STORY });
        await ask();
        assert.deepEqual(stateOf(SECOND), ['closed', 'merged']);
        assert.equal(count(), seen);
        assert.deepEqual(stateOf(FIRST), ['open', null]);
        assert.equal(logs.filter((line) => line.includes('refused —')).length, 2, logs.join('\n'));
        assert.equal(story(), STORY);
        assert.equal(view.store.stories.read(tabId('w1:t1'), textOf('t1'))?.at, world.clock.now);
    });

    test('the column shows the result: the answered question and the merged duplicate are gone from the recap', { timeout: 30_000 }, async () => {
        const column = await view.pane({ cols: 70, rows: 40, role: 'column' });
        try {
            view.refresh();
            const shown = (await column.painted((screen) => screen.text.includes(FIRST) && !screen.text.includes(QUESTION), 'the column shows the merged fact once')).text;
            assert.ok(!shown.includes(SECOND));
            assert.ok(!shown.includes(QUESTION));
        } finally {
            await column.close();
        }
    });

    test('the expanded view shows the paragraph under SESSION SO FAR and the merge in the timeline', { timeout: 30_000 }, async () => {
        const modal = await view.pane({ cols: 100, rows: 140, role: 'modal' });
        try {
            const shown = (await modal.painted((screen) => screen.text.includes('SESSION SO FAR') && screen.text.includes('guests keep their basket'), 'the paragraph')).text.replaceAll(/\s+/gu, ' ');
            assert.ok(shown.includes('guests keep their basket in a cookie'));
            assert.match(shown, /merged/);
        } finally {
            await modal.close();
        }
    });

    test('a paragraph of 121 words is refused with its count and the old paragraph stays', { timeout: 30_000 }, async () => {
        touch(['Wire the cart to the shop']);
        answer = (): Curated => said({ ops: [], story: words(121) });
        await ask();
        assert.ok(logs.includes('curator w1:t1 t1: refused — the paragraph is too long: 121 words, at most 120'), logs.join('\n'));
        assert.equal(story(), STORY);
    });

    test('a fact is merged once: the same merge twice in one answer is applied the first time and refused the second', { timeout: 30_000 }, async () => {
        touch(['The checkout is wired', 'The checkout wiring is done'], 'now');
        answer = (document: string): Curated => {
            const merge = { op: 'close', id: idOf(document, 'The checkout is wired'), why: 'merged', into: idOf(document, 'The checkout wiring is done') };
            return said({ ops: [merge, merge], story: STORY });
        };
        await ask();
        assert.deepEqual(stateOf('The checkout is wired'), ['closed', 'merged']);
        assert.ok(logs.some((line) => /refused — f\d+ is not an open fact \(or is already merged\)/.test(line)), logs.join('\n'));
    });

    test('with repair off a refused answer gets no second call; with repair once it is sent back once with the first answer, and the repaired answer is stored', { timeout: 30_000 }, async () => {
        touch(['Wire the totals']);
        const first = JSON.stringify({ ops: [{ op: 'close', id: 'f99', why: 'merged', into: 'f1' }], story: 'First.' });
        const sent: string[] = [];
        answer = (document: string): Curated => {
            sent.push(document);
            return sent.length === 1 ? { kind: 'curated', text: textOf(first) } : said({ ops: [], story: 'Fixed.' });
        };
        const calling = calls.length;
        await ask();
        assert.equal(calls.length - calling, 1, 'repair is off by default');
        assert.equal(story(), 'First.');
        process.env['TAB_RECAP_CURATOR_REPAIR'] = 'once';
        touch(['Wire the receipts']);
        sent.length = 0;
        await ask();
        assert.equal(sent.length, 2);
        assert.ok(sent[1]?.startsWith(sent[0] ?? ''), 'the repair call carries the same document first');
        assert.ok(sent[1]?.includes(`<previous-answer>\n${first}\n</previous-answer>`));
        assert.ok(sent[1]?.includes('- f99 is not an open fact (or is already merged)'));
        assert.ok(logs.includes('curator w1:t1 t1: story repair — 1 refused'));
        assert.equal(story(), 'Fixed.');
    });

    test('with repair once a too-long paragraph is sent back once; a repair still too long keeps the old paragraph with no third call; a repair that is not JSON keeps the first answer', { timeout: 30_000 }, async () => {
        process.env['TAB_RECAP_CURATOR_REPAIR'] = 'once';
        touch(['Wire the labels']);
        const sent: string[] = [];
        answer = (document: string): Curated => {
            sent.push(document);
            return said({ ops: [], story: words(sent.length === 1 ? 121 : 130) });
        };
        await ask();
        assert.equal(sent.length, 2);
        assert.ok(sent[1]?.includes('- the paragraph is too long: 121 words, at most 120'));
        assert.ok(logs.includes('curator w1:t1 t1: refused — the paragraph is too long: 130 words, at most 120'));
        assert.equal(story(), 'Fixed.');
        touch(['Wire the invoices']);
        sent.length = 0;
        answer = (document: string): Curated => {
            sent.push(document);
            return sent.length === 1 ? said({ ops: [], story: 'Kept first.' }) : { kind: 'curated', text: textOf('not json') };
        };
        await ask();
        assert.equal(sent.length, 1, 'a clean answer with a paragraph gets no repair call');
        assert.equal(story(), 'Kept first.');
        touch(['Wire the refunds']);
        sent.length = 0;
        answer = (document: string): Curated => {
            sent.push(document);
            return sent.length === 1 ? said({ ops: [{ op: 'close', id: 'f98', why: 'merged', into: 'f1' }], story: 'Second.' }) : { kind: 'curated', text: textOf('not json') };
        };
        await ask();
        assert.equal(sent.length, 2);
        assert.equal(story(), 'Second.', 'the repair was not JSON, the first answer stays');
        delete process.env['TAB_RECAP_CURATOR_REPAIR'];
    });

    test('a curator that gives no answer leaves the facts and the paragraph as they were, and the failure is logged', { timeout: 30_000 }, async () => {
        touch(['Add the receipts']);
        answer = (): Curated => NONE;
        const kept = [story(), stateOf(FIRST)];
        await ask();
        assert.deepEqual([story(), stateOf(FIRST)], kept);
        assert.ok(logs.some((line) => line.includes('fake/test gave none')), logs.join('\n'));
    });

    test('a story older than the facts shows its old paragraph as "updating…" until a new one is stored', { timeout: 30_000 }, async () => {
        view.setNow(world.clock.now + HOUR);
        const modal = await view.pane({ cols: 100, rows: 140, role: 'modal' });
        try {
            await modal.painted((screen) => /SESSION SO FAR · \d\d:\d\d · updating…/.test(screen.text.replaceAll(/\s+/gu, ' ')), 'the old paragraph is marked updating');
            assert.match((modal.screen()?.text ?? '').replaceAll(/\s+/gu, ' '), new RegExp(`updating… ${story() ?? ''}`.replaceAll('.', '\\.'), 'u'));
        } finally {
            await modal.close();
        }
    });
});

describe('the curator row of the settings', () => {

    test('the Models group draws the curator as the recap writer until set, explains itself while focused, and offers off', { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            const pane = await opened(world);
            try {
                assert.match(pane.screen()?.text ?? '', /Curator\s+as the recap writer · the recap writer's model · medium/);
                await typed(pane, down(11));
                await pane.painted((screen) => screen.text.includes('merges duplicate facts and writes the "session so far"'), 'the curator explains itself');
                await typed(pane, ['\r']);
                const choosing = (await pane.painted((screen) => screen.text.includes('off — no paragraph, no merges'), 'the choice offers off')).text;
                assert.match(choosing, /▸ as the recap writer — the same harness/);
            } finally {
                await pane.close();
            }
        });
    });

    test('each part of the curator row is saved under its own variable', { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            seedConfig(world, '# mine\n');
            const pane = await opened(world);
            try {
                await typed(pane, [...down(11), '\r', 'k', '\r']);
                await pane.painted((screen) => /Curator\s+\[off\]/.test(screen.text), 'the harness reads off');
                await typed(pane, ['l', 'l']);
                await pane.press('s');
                await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
                assert.equal(configText(world), '# mine\nTAB_RECAP_CURATE_BY=off\n');
            } finally {
                await pane.close();
            }
        });
    });

    test('a curator part an environment variable sets is read-only and names the variable; the other parts stay editable', { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            const pane = await opened(world, { TAB_RECAP_CURATE_MODEL: 'sonnet' });
            try {
                await typed(pane, [...down(11), 'l', '\r']);
                await pane.painted((screen) => screen.text.includes('read-only: TAB_RECAP_CURATE_MODEL'), 'the model part is read-only');
                await typed(pane, ['h', '\r']);
                await pane.painted((screen) => screen.text.includes('▸ as the recap writer'), 'the harness part still opens');
            } finally {
                await pane.close();
            }
        });
    });

    test('the Models group of the curator is drawn in Spanish', { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            const pane = await opened(world, { TAB_RECAP_LOCALE: 'es' });
            try {
                assert.match(pane.screen()?.text ?? '', /Curador\s+como el redactor · el modelo del redactor · medium/);
                await typed(pane, [...down(11), '\r']);
                await pane.painted((screen) => screen.text.includes('apagado — sin párrafo ni fusiones'), 'the choice offers apagado');
            } finally {
                await pane.close();
            }
        });
    });
});
