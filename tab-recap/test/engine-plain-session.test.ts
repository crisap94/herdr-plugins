import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { createEngine } from '#src/recap/application/engine.ts';
import type { Engine, FollowedSession, ScopeId } from '#src/recap/application/engine.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { NO_REPOS } from '#test/support.ts';
import { closureOf } from '#test/support/closure.ts';
import { writer } from '#test/fakes/golden-writer.ts';

const THIS_FILE = 'test/engine-plain-session.test.ts';
const HERDR_SIDE = ['src/adapters/herdr/', 'src/adapters/herdr-core/', 'src/transport/', 'src/daemon/', 'src/column/', 'src/setup/', 'src/compact/'];

const fixture = (name: string): readonly string[] => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n').filter((line) => line !== '');
const TURNS = fixture('replay-claude.jsonl');
const COMPACTION = fixture('claude-compact-boundary.jsonl');
const SESSION = '00000000-0000-4000-8000-000000000001';

const timeOf = (line: string): number => Date.parse((JSON.parse(line) as { timestamp: string }).timestamp);

interface PlainHost {
    readonly engine: Engine;
    readonly store: Store;
    readonly scope: ScopeId;
    readonly session: FollowedSession;
    readonly records: string;
    readonly clock: { now: number };
}

function plainHost(records: string, store: Store): PlainHost {
    const reader = new ClaudeTranscripts(dirname(dirname(records)));
    const scope = tabId('plain:t1');
    const session = laneFrom({ paneId: 'plain:p1', tabId: String(scope), workspaceId: 'plain', agent: reader.agent, session: basename(records, '.jsonl') });
    const clock = { now: 1 };
    const { summarizer } = writer();
    const engine = createEngine({
        source: { transcripts: new TranscriptRegistry({ [reader.agent]: reader }, null, (kind): string => capabilityWording('history-unavailable', kind)) },
        store: { records: store.records, ledger: store.ledger },
        models: { summarizer: () => summarizer },
        environment: { clock: { now: (): Instant => instant(clock.now) }, repos: NO_REPOS, log: () => undefined },
        settings: { language: (): string => 'en', writerView: () => FULL_WRITER_VIEW },
    });
    return { engine, store, scope, session, records, clock };
}

function grow(host: PlainHost, lines: readonly string[]): void {
    appendFileSync(host.records, lines.map((line) => `${line}\n`).join(''));
    host.clock.now = Math.max(host.clock.now + 1, ...lines.flatMap((line) => (Number.isNaN(timeOf(line)) ? [] : [timeOf(line)])));
}

const runsOf = (host: PlainHost): number => host.store.inputs.runs({ tab: String(host.scope), since: null, limit: 100, withInput: false }).length;

test('the engine follows a plain Claude session with no herdr: runs per turn, facts in the ledger, the compaction seen, history as facts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-plain-'));
    const scratch = scratchStore();
    try {
        const records = join(dir, 'projects', '-plain', `${SESSION}.jsonl`);
        mkdirSync(dirname(records), { recursive: true });
        writeFileSync(records, '');
        const host = plainHost(records, scratch.store);
        host.engine.sessionStarted(host.scope, [host.session]);
        assert.equal(runsOf(host), 0, 'a session that has only started has nothing to recap');
        for (const turn of [0, 1, 2]) {
            grow(host, TURNS.slice(turn * 2, turn * 2 + 2));
            await host.engine.refresh(host.scope, [host.session]);
            assert.equal(runsOf(host), turn + 1, `turn ${turn + 1} is recorded as its own run`);
        }
        grow(host, [...TURNS.slice(6, 8), ...COMPACTION]);
        await host.engine.compacted(host.scope, [host.session]);
        assert.equal(runsOf(host), 4, 'the compaction is read in one more run');
        const tasks = scratch.store.records.readRecap(String(host.scope))?.tasks ?? [];
        const facts = tasks.flatMap((task) => scratch.store.ledger.allOf({ tab: String(host.scope), key: task.id }));
        assert.deepEqual(facts.map((fact) => fact.text).toSorted(), ['Add a cart to the shop', 'Added cart totals in src/totals.ts', 'Opened !34 for feat/cart', 'Store carts in SQLite'].toSorted());
        const breaks = scratch.store.boundaries.breaksOf(String(host.scope));
        assert.deepEqual(breaks.map((each) => [each.kind, each.at, each.trigger]), [['compacted', Date.parse('2026-10-07T16:38:09.490Z'), 'manual']]);
        const history = host.engine.history(host.scope, host.session);
        assert.deepEqual(history.map((fact) => fact.text).toSorted(), facts.map((fact) => fact.text).toSorted());
    } finally {
        scratch.dispose();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the plain session and everything it imports reach no herdr, transport, daemon, column, setup or compact file', async () => {
    const closure = await closureOf(THIS_FILE);
    assert.ok(closure.includes('src/recap/application/engine.ts') && closure.includes('src/adapters/transcripts/claude/transcripts.ts'), 'the walk reaches the engine and the reader');
    assert.deepEqual(closure.filter((file) => HERDR_SIDE.some((folder) => file.startsWith(folder))), []);
});
