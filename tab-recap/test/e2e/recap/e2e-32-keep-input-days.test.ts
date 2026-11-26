import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brand, instant, type Count, type Instant, type Text } from '@stateforge-labs/session-ledger';
import type { BriefRetention } from '@stateforge-labs/session-ledger';
import { loadSettings } from '#src/daemon/config.ts';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import { runsOf } from '#test/db/support.ts';
import { ledgerWorld, type LedgerWorld } from '../support/ledger-world.ts';

const DAY = 86_400_000;
const START = 1_800_000_000_000;
const KEY = 'TAB_RECAP_KEEP_INPUT_DAYS';
const QUERY = { tab: null, since: null, limit: 10, withInput: false } as const;
const ANCHOR = 'Add a cart to the shop';

const ENV = [KEY, 'HERDR_PLUGIN_CONFIG_DIR'] as const;
const saved = new Map<string, string | undefined>();
let config = '';

const setDays = (value: string | undefined): void => {
    if (value === undefined) {
        delete process.env[KEY];
    } else {
        process.env[KEY] = value;
    }
};

const narrator = (anchor: string): Record<string, unknown> => ({ op: 'add', section: 'done', text: 'claude completed the migration.', anchor });
const goal = (text: string, anchor: string): Record<string, unknown> => ({ op: 'add', section: 'goal', text, anchor });

describe('the days the run inputs are kept', () => {
    let world: LedgerWorld;
    let retention: InputRetention;
    const lines: string[] = [];

    const refresh = async (text: string, anchor: string): Promise<void> => {
        world.grow('w1:p1', 1);
        world.script({ kind: 'ops', ops: [goal(text, anchor), narrator(anchor)] }, { kind: 'ops', ops: [narrator(anchor)] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
    };

    before(() => {
        for (const key of ENV) {
            saved.set(key, process.env[key]);
        }
        config = mkdtempSync(join(tmpdir(), 'tab-recap-keep-days-'));
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = config;
        setDays(undefined);
        world = ledgerWorld({ lanes: [{ pane: 'w1:p1' }], now: START, keepInput: () => loadSettings().keepInputDays > 0 });
        retention = new InputRetention({
            inputs: world.store.inputs, briefs: world.store.autocompactBriefs, clock: { now: (): Instant => instant(world.clock.now) }, days: (): Count => loadSettings().keepInputDays,
            briefRetention: (): BriefRetention => ({ kind: 'days', value: brand<number, 'RetentionDays'>(14) }), log: (line: Text): void => { lines.push(String(line)); },
        });
    });

    after(() => {
        world.close();
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        rmSync(config, { recursive: true, force: true });
    });

    test('the retention is 14 days unless set to a whole number of days; 0 keeps none, spaces are ignored', { timeout: 30_000 }, () => {
        assert.equal(loadSettings().keepInputDays, 14);
        for (const bad of ['', 'x', '-3', '2.5']) {
            setDays(bad);
            assert.equal(loadSettings().keepInputDays, 14, bad);
        }
        const read = (value: string): number => {
            setDays(value);
            return loadSettings().keepInputDays;
        };
        assert.deepEqual(['0', '7', ' 30 '].map(read), [0, 7, 30]);
        setDays(undefined);
    });

    test('with KEEP_INPUT_DAYS at 0 a run stores no input, and its gate counts are still stored', { timeout: 30_000 }, async () => {
        setDays('0');
        await refresh('Migrate the metrics store', ANCHOR);
        const [run] = runsOf(world.store.inputs, QUERY);
        assert.ok(run !== undefined);
        assert.equal(run.input, 'absent');
        assert.deepEqual(run.gateStats, { refused: { G1: 2 }, flagged: {}, dropped: 1 });
        assert.equal(world.store.inputs.document(run.id), null);
    });

    test('with KEEP_INPUT_DAYS at 7 the next run keeps the document as the writer saw it, with its gate counts', { timeout: 30_000 }, async () => {
        setDays('7');
        world.clock.now = START + DAY;
        await refresh('Copy the metrics to victoria', 'Use SQLite for it, no server');
        const [run] = runsOf(world.store.inputs, QUERY);
        assert.ok(run !== undefined);
        assert.equal(run.at, START + DAY);
        assert.equal(run.input, 'present');
        assert.deepEqual(run.gateStats, { refused: { G1: 2 }, flagged: {}, dropped: 1 });
        const document = world.store.inputs.document(run.id) ?? '';
        assert.match(document, /^<recap_input version="2">[\s\S]*Add a cart to the shop[\s\S]*<\/recap_input>$/);
        assert.doesNotMatch(document, /<correction>/);
    });

    test('inside the 7 days nothing is forgotten', { timeout: 30_000 }, () => {
        world.clock.now = START + DAY + 6 * DAY;
        assert.equal(retention.tick(), 0);
        assert.deepEqual(runsOf(world.store.inputs, QUERY).map((run) => run.input), ['present', 'absent']);
    });

    test('after the 7 days the input is forgotten and the run stays', { timeout: 30_000 }, () => {
        world.clock.now = START + DAY + 8 * DAY;
        assert.equal(retention.tick(), 1);
        assert.deepEqual(runsOf(world.store.inputs, QUERY).map((run) => [run.at, run.input]), [[START + DAY, 'absent'], [START, 'absent']]);
        assert.match(lines.join(), /deleted 1 stored run input older than 7 days/);
    });
});
