import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countOf, instant, NOT_AWAITING } from '@stateforge-labs/session-ledger';
import type { BackgroundItem, Located } from '@stateforge-labs/session-ledger';
import { continuationNote } from '@stateforge-labs/session-ledger/compaction-timing';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import { tabIdOf } from '#src/recap/domain/ids.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { registryOf, sourceWorld, type SourceWorld } from '../support/source-world.ts';

const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures');
const fixture = (name: string): readonly string[] => readFileSync(join(FIXTURES, name), 'utf8').split('\n').filter((line) => line !== '');
const MARK_AT = Date.parse('2026-10-07T16:38:09.490Z');
const MINUTE = 60_000;
const BUDGET = countOf(1 << 20);

const claudeOver = (world: SourceWorld): { readonly engine: ReturnType<SourceWorld['engineOver']>; readonly seat: ReturnType<SourceWorld['seat']> } => ({
    engine: world.engineOver(registryOf([new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))])),
    seat: world.seat('claude', { session: 's1' }),
});

const breaksOf = (world: SourceWorld): readonly (readonly [string, number, string | null, number | null, number | null, number | null])[] => world.store.boundaries.breaksOf(tabIdOf(String(world.scope))).map((each) => [each.kind, each.at, each.trigger, each.tokensBefore, each.tokensAfter, each.took]);

async function claudeWorld(asked: readonly number[] = []): Promise<{ readonly world: SourceWorld; readonly file: string; readonly compacted: () => Promise<void> }> {
    const world = sourceWorld();
    const file = world.claudeFile('s1', 'claude-more.jsonl');
    const { engine, seat } = claudeOver(world);
    const turns = fixture('replay-claude.jsonl');
    world.clock.now = 10;
    appendFileSync(file, `${turns.slice(0, 2).join('\n')}\n`);
    await engine.refresh(world.scope, [seat]);
    for (const at of asked) {
        world.store.compactions.begin({ tab: tabIdOf(String(world.scope)), pane: paneId('src:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(at), origin: 'operator' });
    }
    appendFileSync(file, `${[...turns.slice(2, 4), ...fixture('claude-compact-boundary.jsonl')].join('\n')}\n`);
    world.clock.now = MARK_AT + 2 * MINUTE;
    return { world, file, compacted: () => engine.compacted(world.scope, [seat]) };
}

describe('claude compacts by itself', () => {
    test('the mark in its own record becomes one boundary at the mark\'s time, with its word, its tokens and how long it took', { timeout: 30_000 }, async () => {
        const { world, compacted } = await claudeWorld();
        try {
            await compacted();
            assert.deepEqual(breaksOf(world), [['compacted', MARK_AT, 'manual', 39_532, 3057, 15_588]]);
        } finally {
            world.dispose();
        }
    });

    test('reading the same record again stores no second boundary, and a newer mark stores one more', { timeout: 30_000 }, async () => {
        const { world, file, compacted } = await claudeWorld();
        try {
            await compacted();
            await compacted();
            assert.equal(breaksOf(world).length, 1);
            const later = fixture('claude-compact-boundary.jsonl')[1]?.replace('2026-10-07T16:38:09.490Z', '2026-10-07T16:50:00.000Z') ?? '';
            appendFileSync(file, `${later}\n`);
            world.clock.now = MARK_AT + 20 * MINUTE;
            await compacted();
            assert.deepEqual(breaksOf(world).map((each) => each[1]), [MARK_AT, Date.parse('2026-10-07T16:50:00.000Z')]);
        } finally {
            world.dispose();
        }
    });

    test('a compaction that failed inside the agent leaves no boundary', { timeout: 30_000 }, async () => {
        const { world, file, compacted } = await claudeWorld();
        try {
            await compacted();
            appendFileSync(file, `${JSON.stringify({ type: 'system', subtype: 'local_command', content: '<local-command-stderr>Error during compaction: summarization produced empty response</local-command-stderr>', timestamp: '2026-10-07T16:55:00.000Z' })}\n`);
            world.clock.now = MARK_AT + 30 * MINUTE;
            await compacted();
            assert.equal(breaksOf(world).length, 1);
        } finally {
            world.dispose();
        }
    });

    test('a lane whose record cannot be read adds no boundary', { timeout: 30_000 }, async () => {
        const { world } = await claudeWorld();
        try {
            const { engine } = claudeOver(world);
            await engine.compacted(world.scope, [world.seat('claude', { session: 'gone' })]);
            assert.deepEqual(breaksOf(world), []);
        } finally {
            world.dispose();
        }
    });

    test('a compaction the plugin started up to ten minutes before the mark is the plugin\'s', { timeout: 30_000 }, async () => {
        const { world, compacted } = await claudeWorld([MARK_AT - 10 * MINUTE]);
        try {
            await compacted();
            assert.equal(breaksOf(world)[0]?.[2], 'plugin');
        } finally {
            world.dispose();
        }
    });

    test('one the plugin started more than ten minutes before, or after the mark, leaves the mark to the agent\'s word', { timeout: 30_000 }, async () => {
        const early = await claudeWorld([MARK_AT - 10 * MINUTE - 1]);
        const late = await claudeWorld([MARK_AT + 1]);
        try {
            await early.compacted();
            await late.compacted();
            assert.deepEqual([breaksOf(early.world)[0]?.[2], breaksOf(late.world)[0]?.[2]], ['manual', 'manual']);
        } finally {
            early.world.dispose();
            late.world.dispose();
        }
    });
});

describe('codex compacts by itself', () => {
    test('its record carries no time and no word: the mark is dated by the read and taken as automatic', { timeout: 30_000 }, async () => {
        const world = sourceWorld();
        try {
            const file = world.codexFile('codex-session.jsonl');
            const engine = world.engineOver(registryOf([new CodexTranscripts(fsPathOf(join(world.dir, 'codex')))]));
            world.clock.now = 10;
            await engine.refresh(world.scope, [world.seat('codex', { cwd: '/repo' })]);
            appendFileSync(file, readFileSync(join(FIXTURES, 'sources', 'codex-context-compacted.jsonl'), 'utf8').split('\n').slice(1).join('\n'));
            world.clock.now = MARK_AT;
            await engine.compacted(world.scope, [world.seat('codex', { cwd: '/repo' })]);
            assert.deepEqual(breaksOf(world).map((each) => [each[0], each[1], each[2]]), [['compacted', MARK_AT, 'auto']]);
        } finally {
            world.dispose();
        }
    });
});


async function stillRunning(): Promise<readonly BackgroundItem[]> {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', 'claude-turn-in-flight.jsonl');
        const reader = new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')));
        const located: Located = await reader.locate(world.seat('claude', { session: 's1' }));
        if (located.kind !== 'located') {
            throw new Error('the lane\'s record is found');
        }
        const found = await reader.inFlight.read(located.source, BUDGET);
        return found.kind === 'in-flight' ? found.background : [];
    } finally {
        world.dispose();
    }
}

describe('what the agent still waits for joins the brief as a continuation note', () => {
    test('what its record shows still running is named, each launch with its label', { timeout: 30_000 }, async () => {
        const background = await stillRunning();
        assert.equal(continuationNote(NOT_AWAITING, background), 'Still running: Bash "watch the build", Bash "Bash", Bash "Bash", Monitor "tail the log", Agent "review the diff".');
    });
});
