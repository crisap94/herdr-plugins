import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import type { ContextUse, WindowSource } from '@stateforge-labs/session-ledger';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import { parseAgentKind, parsePaneId, parseTabId, type HarnessKind, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseInstant, type Instant } from '@stateforge-labs/session-ledger';
import type { Forge } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

export interface LaneWebRecord {
    readonly base: Text;
    readonly forge: Forge;
    readonly branch: Text | null;
}

export interface TabLaneRecord {
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly status: Text;
    readonly title: Text | null;
    readonly cwd: Text | null;
    readonly lastPrompt?: Text | null;
    readonly web?: LaneWebRecord | null;
    readonly context?: ContextUse | null;
    readonly since?: Instant | null;
}

export interface TabViewRecord {
    readonly tab: ScopeId;
    readonly column: Text | null;
    readonly lanes: readonly TabLaneRecord[];
    readonly at: Instant;
    readonly daemonVersion?: Text | null;
}

export interface TabViewStore {
    readTab(tab: ScopeId): TabViewRecord | null;
    writeTab(view: TabViewRecord): void;
    tabOf(pane: SessionKey): ScopeId | null;
}

export type LiveLanesRead = { readonly kind: 'read'; readonly lanes: readonly RestoredLane[] } | Unknown;

export interface LiveLanes {
    liveLanes(): LiveLanesRead;
}

type Row = Record<string, unknown>;

type LaneCore = Pick<TabLaneRecord, 'pane' | 'agent' | 'status' | 'title' | 'cwd'>;

type LaneExtras = Omit<TabLaneRecord, keyof LaneCore>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const FORGES: readonly Forge[] = ['gitlab', 'github'];

const SOURCES: readonly WindowSource[] = ['agent', 'catalogue', 'table', 'observed', 'setting'];

export function parseLaneWebRecord(input: unknown): Result<LaneWebRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const base = parseText(input.base);
    if (base.kind === 'err') return base;
    const forge = FORGES.find((option) => option === input.forge);
    if (forge === undefined) return err({ kind: 'out-of-range' });
    const branch = input.branch === null ? ok(null) : parseText(input.branch);
    if (branch.kind === 'err') return branch;
    return ok({ base: base.value, forge, branch: branch.value });
}

function contextOf(row: Row): Result<ContextUse | null | undefined, ParseFailure> {
    const context = row.context;
    if (context === undefined || context === null) return ok(context);
    if (!isRow(context)) return err({ kind: 'not-a-row' });
    const { tokens, window } = context;
    if (typeof tokens !== 'number' || typeof window !== 'number') return err({ kind: 'not-a-number' });
    const source = SOURCES.find((option) => option === context.source);
    return source === undefined ? err({ kind: 'out-of-range' }) : ok({ tokens: countOf(tokens), window: countOf(window), source });
}

function coreOf(input: Row): Result<LaneCore, ParseFailure> {
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') return pane;
    const agent = parseAgentKind(input.agent);
    if (agent.kind === 'err') return agent;
    const status = parseText(input.status);
    if (status.kind === 'err') return status;
    const title = input.title === null ? ok(null) : parseText(input.title);
    if (title.kind === 'err') return title;
    const cwd = input.cwd === null ? ok(null) : parseText(input.cwd);
    if (cwd.kind === 'err') return cwd;
    return ok({ pane: pane.value, agent: agent.value, status: status.value, title: title.value, cwd: cwd.value });
}

function lastPromptOf(row: Row): Result<Text | null | undefined, ParseFailure> {
    return row.lastPrompt === undefined || row.lastPrompt === null ? ok(row.lastPrompt) : parseText(row.lastPrompt);
}

function webOf(row: Row): Result<LaneWebRecord | null | undefined, ParseFailure> {
    return row.web === undefined || row.web === null ? ok(row.web) : parseLaneWebRecord(row.web);
}

function sinceOf(row: Row): Result<Instant | null | undefined, ParseFailure> {
    return row.since === undefined || row.since === null ? ok(row.since) : parseInstant(row.since);
}

function extrasOf(input: Row): Result<LaneExtras, ParseFailure> {
    const lastPrompt = lastPromptOf(input);
    if (lastPrompt.kind === 'err') return lastPrompt;
    const web = webOf(input);
    if (web.kind === 'err') return web;
    const context = contextOf(input);
    if (context.kind === 'err') return context;
    const since = sinceOf(input);
    if (since.kind === 'err') return since;
    return ok({
        ...(lastPrompt.value === undefined ? {} : { lastPrompt: lastPrompt.value }),
        ...(web.value === undefined ? {} : { web: web.value }),
        ...(context.value === undefined ? {} : { context: context.value }),
        ...(since.value === undefined ? {} : { since: since.value }),
    });
}

export function parseTabLaneRecord(input: unknown): Result<TabLaneRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const core = coreOf(input);
    if (core.kind === 'err') return core;
    const extras = extrasOf(input);
    if (extras.kind === 'err') return extras;
    return ok({ ...core.value, ...extras.value });
}

function daemonVersionOf(row: Row): Result<Text | null | undefined, ParseFailure> {
    if (row.daemonVersion === undefined || row.daemonVersion === null) return ok(row.daemonVersion);
    return parseText(row.daemonVersion);
}

function lanesOf(row: Row): Result<readonly TabLaneRecord[], ParseFailure> {
    if (!Array.isArray(row.lanes)) return err({ kind: 'not-a-row' });
    const lanes: TabLaneRecord[] = [];
    for (const lane of row.lanes) {
        const parsed = parseTabLaneRecord(lane);
        if (parsed.kind === 'err') return parsed;
        lanes.push(parsed.value);
    }
    return ok(lanes);
}

export function parseTabViewRecord(input: unknown): Result<TabViewRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const tab = parseTabId(input.tab);
    if (tab.kind === 'err') return tab;
    const column = input.column === null ? ok(null) : parseText(input.column);
    if (column.kind === 'err') return column;
    const lanes = lanesOf(input);
    if (lanes.kind === 'err') return lanes;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const daemonVersion = daemonVersionOf(input);
    if (daemonVersion.kind === 'err') return daemonVersion;
    return ok({
        tab: tab.value,
        column: column.value,
        lanes: lanes.value,
        at: at.value,
        ...(daemonVersion.value === undefined ? {} : { daemonVersion: daemonVersion.value }),
    });
}
