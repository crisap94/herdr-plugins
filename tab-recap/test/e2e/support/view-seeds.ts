import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { blankRecap, countOf, duration, instant, NO_SECTIONS, parseNonEmptyText, textOf, usdOf, cursorOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { RecapSections, Recap } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { knownOr } from '#src/ports/guarded-reads.ts';
import { cursor, recordOps, seed, type RunInput } from '#test/db/support.ts';
import { oneTask } from '#test/support.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import type { ViewWorld } from './view-world.ts';

export const NOW = Date.parse('2026-10-07T16:30:00Z');
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const VERSION = '3.7.6';

export interface LaneSeed {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly title: string | null;
    readonly cwd?: string | null;
    readonly lastPrompt?: string | null;
    readonly fromScreen?: boolean;
}

export function showTab(world: Pick<ViewWorld, 'store'>, lanes: readonly LaneSeed[], over: { readonly tab?: string; readonly daemonVersion?: string | null; readonly at?: number } = {}): void {
    const tab = over.tab ?? 'w1:t1';
    world.store.views.writeTab(viewRecord({
        tab, column: 'w1:p9', at: over.at ?? NOW, daemonVersion: over.daemonVersion === undefined ? VERSION : over.daemonVersion,
        lanes: lanes.map((lane) => ({ pane: lane.pane, agent: lane.agent, status: lane.status, title: lane.title, cwd: lane.cwd ?? null, ...(lane.lastPrompt === undefined ? {} : { lastPrompt: lane.lastPrompt }) })),
    }));
}

export const sections = (over: Partial<Record<keyof RecapSections, string | readonly string[]>>): RecapSections => {
    const merged: Record<string, unknown> = { ...NO_SECTIONS };
    for (const [key, value] of Object.entries(over)) {
        merged[key] = typeof value === 'string' ? textOf(value) : value.map(textOf);
    }
    return merged as unknown as RecapSections;
};

export interface RecapSeed {
    readonly tab?: string;
    readonly at: number | null;
    readonly sections?: RecapSections;
    readonly markdown?: string;
    readonly language?: string;
    readonly backend?: string;
    readonly lanes?: readonly { readonly pane: string; readonly agent: string; readonly title: string | null; readonly lastPrompt: string | null }[];
}

export function showRecap(world: Pick<ViewWorld, 'store'>, recap: RecapSeed): void {
    const base = blankRecap(tabId(recap.tab ?? 'w1:t1'));
    const seeded: Recap = {
        ...base,
        at: recap.at === null ? null : instant(recap.at),
        backend: textOf(recap.backend ?? 'claude/haiku'),
        language: textOf(recap.language ?? 'en'),
        tasks: oneTask(recap.markdown ?? 'stale text that is never shown', recap.sections ?? null),
        sessions: (recap.lanes ?? []).map((lane) => ({ key: paneId(lane.pane), agent: agentKind(lane.agent), transcript: sourcePathOf(`/t/${lane.pane}`), cursor: cursorOf(1), tail: null, title: lane.title === null ? null : textOf(lane.title), lastPrompt: lane.lastPrompt === null ? null : textOf(lane.lastPrompt), harnessRecap: null })),
    };
    seed(world.store, seeded);
    if (recap.sections === undefined && recap.markdown !== undefined) {
        world.store.db.prepare('UPDATE run_task SET legacy_markdown = ?').run(recap.markdown);
    }
}

export function showAlert(world: Pick<ViewWorld, 'store'>, pane: string, label: string, at: number, details: readonly string[]): void {
    world.store.paneAlerts.put({ source: must(parseNonEmptyText('idle')), pane: paneId(pane), label: textOf(label), at: instant(at), details: details.map(textOf) });
}

export function golden(path: string, plain: readonly string[]): void {
    const text = `${plain.join('\n')}\n`;
    if (process.env['UPDATE_GOLDEN'] === '1') {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
    }
    assert.ok(existsSync(path), `no golden at ${path}; run with UPDATE_GOLDEN=1 once and read the file`);
    assert.equal(text, readFileSync(path, 'utf8'));
}

export const goldenIn = (directory: string, name: string): string => join(directory, 'fixtures', name);

export interface FactSeed {
    readonly section: 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
    readonly text: string;
    readonly at: number;
    readonly why?: string;
}

export interface BreakSeed {
    readonly at: number;
    readonly before: number;
    readonly after: number;
    readonly took: number | null;
    readonly trigger?: 'manual' | 'auto';
}

const TASK = { id: textOf('t1'), name: textOf(''), sessions: [paneId('w1:p1')] } as const;

const runOf = (at: number, over: Partial<RunInput> = {}): RunInput => ({
    scope: tabId('w1:t1'), at: instant(at), cause: 'turn-ended', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null,
    sessions: [cursor('w1:p1')], tasks: [TASK], ops: [], ...over,
});

export function recordFacts(world: Pick<ViewWorld, 'store'>, runAt: number, facts: readonly FactSeed[]): void {
    recordOps(world.store, runOf(runAt, {
        ops: [{ task: textOf('t1'), ops: facts.map((fact) => ({ op: 'add' as const, section: fact.section, text: textOf(fact.text), why: fact.why === undefined ? null : textOf(fact.why), ref: null, at: instant(fact.at), agent: null })) }],
    }));
}

export function closeFact(world: Pick<ViewWorld, 'store'>, text: string, why: 'done' | 'wrong' | 'superseded' | 'answered' | 'rewritten', at: number): void {
    const known = knownOr(world.store.ledger.allOf({ scope: tabId('w1:t1'), key: textOf('t1') }), []);
    const target = known.find((one) => one.text === text);
    assert.ok(target !== undefined, `no fact "${text}" to close`);
    recordOps(world.store, runOf(at, { ops: [{ task: textOf('t1'), ops: [{ op: 'close' as const, id: target.id, why }] }] }));
}

export function recordBreaks(world: Pick<ViewWorld, 'store'>, runAt: number, breaks: readonly BreakSeed[]): void {
    recordOps(world.store, runOf(runAt, {
        marks: breaks.map((one, position) => ({ key: paneId('w1:p1'), at: instant(one.at), cursor: countOf(200 + position), tokensBefore: countOf(one.before), tokensAfter: countOf(one.after), ...(one.took === null ? {} : { tookMs: duration(one.took) }), ...(one.trigger === undefined ? {} : { trigger: one.trigger }) })),
        sessions: [cursor('w1:p1', 300)],
    }));
}

export function recordSwitch(world: Pick<ViewWorld, 'store'>, runAt: number): void {
    recordOps(world.store, runOf(runAt, { sessions: [{ ...cursor('w1:p1', 400), transcript: sourcePathOf('/t/w1:p1-switched') }] }));
}

export function recordCompactions(world: Pick<ViewWorld, 'store'>, compactions: readonly { readonly at: number; readonly before: number; readonly after: number; readonly origin: 'operator' | 'auto' }[]): void {
    const add = world.store.db.prepare("INSERT INTO compaction (id, tab_id, pane, agent, stage, brief, started_at, stage_at, finished_at, tokens_before, tokens_after, origin) VALUES (randomblob(16), 'w1:t1', 'w1:p1', 'claude', 'compacted', 'written', ?, ?, ?, ?, ?, ?)");
    for (const one of compactions) {
        add.run(one.at, one.at, one.at + 20_000, one.before, one.after, one.origin);
    }
}
