import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF, compactionWorld, SESSION, type CompactionWorld } from '../support/compaction-world.ts';

type Setup = (made: CompactionWorld) => void;

async function lane(agent: string, setup: Setup, env: Readonly<Record<string, string>> = {}): Promise<CompactionWorld> {
    const made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', ...env });
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    made.lanes([{ pane: 'w1:p1', agent, status: 'idle', ...(agent === 'claude' ? { session: SESSION } : {}) }]);
    setup(made);
    await made.world.start();
    return made;
}

async function asked(made: CompactionWorld): Promise<void> {
    const ran = await made.world.world.command('compact');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, 'tab-recap: compaction requested\n');
}

const told = (made: CompactionWorld, line: string): Promise<true> => made.world.until(() => (made.toasts().includes(line) ? true : undefined), `the toast ${line}; the toasts read ${JSON.stringify(made.toasts())}`);

describe('compact on a codex agent that is working', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('codex', (each) => { each.agentIs('working'); });
    });

    after(async () => {
        await made.close();
    });

    test('the operator is told why nothing happened', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact codex | codex is working: not compacted — try again when it is idle');
    });

    test('nothing is typed, no brief is written and the recap is not refreshed', { timeout: 30_000 }, () => {
        assert.deepEqual(made.typed(), []);
        assert.equal(made.toasts().length, 1, 'a skip is one toast');
        assert.equal(made.world.model.calls().length, 0);
        assert.equal(made.world.rows('SELECT id FROM run').length, 0);
    });

    test('the record says skipped, with the status as the reason', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('skipped');
        assert.deepEqual([row['agent'], row['why'], row['brief'], row['finished_at'] === null], ['codex', 'working', null, false]);
    });
});

describe('compact on a codex agent that was working and is idle on the next ask', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('codex', (each) => { each.agentIs('working'); });
    });

    after(async () => {
        await made.close();
    });

    test('the refusal frees the lane: once it is idle, the next ask compacts', { timeout: 30_000 }, async () => {
        await asked(made);
        await made.awaitStage('skipped');
        made.agentIs('idle');
        await asked(made);
        assert.deepEqual(await made.awaitTyped(2), ['text /compact', 'keys enter']);
    });
});

describe('compact on a claude agent that is blocked', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('claude', (each) => { each.agentIs('blocked'); });
    });

    after(async () => {
        await made.close();
    });

    test('the operator is told, and nothing is typed or written', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact claude | claude is blocked: not compacted — try again when it is idle');
        assert.deepEqual(made.typed(), []);
        assert.equal(made.world.model.calls().length, 0);
    });

    test('the record says skipped, with the status as the reason', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('skipped');
        assert.deepEqual([row['agent'], row['why']], ['claude', 'blocked — needs you']);
    });
});

describe('compact on an opencode agent whose status herdr cannot tell', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('opencode', (each) => { each.agentIs('unknown'); });
    });

    after(async () => {
        await made.close();
    });

    test('the operator is told, and nothing is typed', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact opencode | opencode is unknown: not compacted — try again when it is idle');
        assert.deepEqual(made.typed(), []);
        assert.equal((await made.awaitStage('skipped'))['agent'], 'opencode');
    });
});

describe('compact on a codex agent that turns busy while the brief is written', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('codex', (each) => { each.agentGoes(['idle', 'working']); });
    });

    after(async () => {
        await made.close();
    });

    test('the brief was written, then the check before typing refused: the operator is told', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact codex | codex is working: not compacted — try again when it is idle');
        assert.ok(made.toasts().includes('Compact codex | Writing what codex should keep…'));
        assert.equal(made.world.model.calls().length, 1);
    });

    test('nothing is typed and the record says skipped, after having been compacting', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('skipped');
        assert.deepEqual([row['why'], row['brief']], ['working', 'written']);
        assert.deepEqual(made.typed(), []);
    });
});

describe('compact on a claude agent that turns blocked while the brief is written', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('claude', (each) => { each.agentGoes(['idle', 'blocked']); });
    });

    after(async () => {
        await made.close();
    });

    test('it is refused again before typing, whatever its plan says: nothing is typed', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact claude | claude is blocked: not compacted — try again when it is idle');
        const row = await made.awaitStage('skipped');
        assert.deepEqual([row['why'], row['brief']], ['blocked — needs you', 'written']);
        assert.deepEqual(made.typed(), []);
    });
});

describe('compact on a claude agent that is working: it queues what it is told', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('claude', (each) => { each.agentIs('working'); });
    });

    after(async () => {
        await made.close();
    });

    test('the operator is told the compaction waits behind the turn', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact claude | Compacting claude: queued behind the current turn');
    });

    test('the line is typed behind the turn, and the record is queued as it is typed', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(3), ['text /compact ', `text ${BRIEF}`, 'keys enter']);
        const row = await made.awaitStage('compacting');
        assert.deepEqual([row['queued'], row['brief']], [1, 'written']);
    });

    test('the turn ends before the compaction: the record is no longer queued', { timeout: 30_000 }, async () => {
        made.world.status('idle');
        await made.world.until(() => (made.compactions().at(-1)?.['queued'] === 0 ? true : undefined), 'the record no longer queued');
        assert.equal(made.compactions().at(-1)?.['stage'], 'compacting');
    });

    test('the mark a later settle brings confirms it, with two toasts in all and no refusal', { timeout: 30_000 }, async () => {
        made.mark();
        made.settle();
        const row = await made.awaitStage('compacted');
        assert.equal(row['queued'], 0);
        await made.world.until(() => (made.toasts().length === 2 ? true : undefined), 'two toasts');
        assert.deepEqual(made.toasts(), ['Compact claude | Compacting claude: queued behind the current turn', 'Compact claude | claude compacted: 39.5k → 3.1k tokens in 16 s']);
    });
});

describe('compact on a claude agent that starts working while the brief is written', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await lane('claude', (each) => { each.agentGoes(['idle', 'working']); });
    });

    after(async () => {
        await made.close();
    });

    test('it is typed queued, not refused, and the record is queued', { timeout: 30_000 }, async () => {
        await asked(made);
        assert.deepEqual(await made.awaitTyped(3), ['text /compact ', `text ${BRIEF}`, 'keys enter']);
        const row = await made.awaitStage('compacting');
        assert.equal(row['queued'], 1);
    });
});

describe('compact in a tab with two agents and no focus, asked from a pane that is no agent', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom' });
        made.world.typing();
        made.lanes([{ pane: 'w1:p1', agent: 'claude', status: 'idle' }, { pane: 'w1:p3', agent: 'codex', status: 'idle' }]);
        await made.world.start();
    });

    after(async () => {
        await made.close();
    });

    test('no agent is guessed: the operator is told, and nothing is typed', { timeout: 30_000 }, async () => {
        await asked(made);
        await told(made, 'Compact w1:t1 | No agent here can be compacted');
        assert.deepEqual([made.typed('w1:p1'), made.typed('w1:p3')], [[], []]);
        assert.equal(made.compactions().length, 0);
    });
});

describe('compact in a tab with two agents, asked from the pane of one of them', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p3' }) });
        made.world.model.answer('default', BRIEF);
        made.world.typing();
        made.lanes([{ pane: 'w1:p1', agent: 'claude', status: 'idle' }, { pane: 'w1:p3', agent: 'codex', status: 'idle' }]);
        await made.world.start();
    });

    after(async () => {
        await made.close();
    });

    test('the agent of that pane is the one compacted, whatever is focused', { timeout: 30_000 }, async () => {
        await asked(made);
        assert.deepEqual(await made.awaitTyped(2, 'w1:p3'), ['text /compact', 'keys enter']);
        assert.deepEqual(made.typed('w1:p1'), []);
    });
});
