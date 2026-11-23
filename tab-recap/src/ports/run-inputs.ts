import { err, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { isSection, type FactId, type RunId, type Section } from '#src/recap/domain/fact.ts';
import { gateName } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { parseTabId, type TabId } from '#src/recap/domain/ids.ts';
import { parsePresence, type Presence } from '#src/recap/domain/presence.ts';
import { parseFactId, parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
import type { GateName } from '@stateforge-labs/session-ledger/unstable/contract/kernel.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type { StoredRun } from './twins/legacy.ts';

export type ItemsMode = 'added' | 'state';

export type RunBirth = 'born' | 'carried';

export type InputFilter = 'any' | 'with-input';

export interface RunRecord {
    readonly id: RunId;
    readonly tab: TabId;
    readonly at: Instant;
    readonly language: Text;
    readonly backend: Text | null;
    readonly input: Presence;
    readonly gateStats: GateStats | null;
}

export interface RunEntry {
    readonly key: Text;
    readonly section: Section;
    readonly text: Text;
    readonly fact: FactId;
    readonly birth: RunBirth;
    readonly anchor: Text | null;
}

export interface JudgeEntry {
    readonly key: Text;
    readonly section: Text | Section;
    readonly text: Text;
    readonly birth: RunBirth;
}

export interface RunFilter {
    readonly tab: TabId | null;
    readonly since: Instant | null;
    readonly limit: Count;
    readonly input: InputFilter;
}

export interface GateTally {
    readonly at: Instant;
    readonly stats: GateStats;
}

export interface RunInputReader {
    runs(query: RunFilter): readonly RunRecord[];
    document(run: RunId): Text | null;
    itemsOf(run: RunId, mode: ItemsMode): readonly RunEntry[];
    gateCounts(since: Instant | null): readonly GateTally[];
    prune(before: Instant): Count;
}

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const BIRTHS: readonly RunBirth[] = ['born', 'carried'];

function backendOf(row: Row): Result<Text | null, ParseFailure> {
    return row.backend === null ? ok(null) : parseText(row.backend);
}

function anchorOf(row: Row): Result<Text | null, ParseFailure> {
    return row.anchor === null ? ok(null) : parseText(row.anchor);
}

function statsOf(stats: Row): Result<GateStats, ParseFailure> {
    if (!isRow(stats.refused) || !isRow(stats.flagged)) return err({ kind: 'not-a-row' });
    const refused: Record<GateName, Count> = {};
    for (const [gate, value] of Object.entries(stats.refused)) {
        const count = parseCount(value);
        if (count.kind === 'err') return count;
        refused[gateName(gate)] = count.value;
    }
    const flagged: Record<GateName, Count> = {};
    for (const [gate, value] of Object.entries(stats.flagged)) {
        const count = parseCount(value);
        if (count.kind === 'err') return count;
        flagged[gateName(gate)] = count.value;
    }
    const dropped = parseCount(stats.dropped);
    if (dropped.kind === 'err') return dropped;
    return ok({ refused, flagged, dropped: dropped.value });
}

function gateStatsOf(row: Row): Result<GateStats | null, ParseFailure> {
    const stats = row.gateStats;
    if (stats === null) return ok(null);
    return isRow(stats) ? statsOf(stats) : err({ kind: 'not-a-row' });
}

export function parseRunRecord(input: unknown): Result<RunRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const id = parseRunId(input.id);
    if (id.kind === 'err') return id;
    const tab = parseTabId(input.tab);
    if (tab.kind === 'err') return tab;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const language = parseText(input.language);
    if (language.kind === 'err') return language;
    const backend = backendOf(input);
    if (backend.kind === 'err') return backend;
    const presence = parsePresence(input.input);
    if (presence.kind === 'err') return presence;
    const gateStats = gateStatsOf(input);
    if (gateStats.kind === 'err') return gateStats;
    return ok({
        id: id.value,
        tab: tab.value,
        at: at.value,
        language: language.value,
        backend: backend.value,
        input: presence.value,
        gateStats: gateStats.value,
    });
}

export function parseRunEntry(input: unknown): Result<RunEntry, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const key = parseText(input.key);
    if (key.kind === 'err') return key;
    const section = input.section;
    if (!isSection(section)) return err({ kind: 'out-of-range' });
    const text = parseText(input.text);
    if (text.kind === 'err') return text;
    const fact = parseFactId(input.fact);
    if (fact.kind === 'err') return fact;
    const birth = BIRTHS.find((option) => option === input.birth);
    if (birth === undefined) return err({ kind: 'out-of-range' });
    const anchor = anchorOf(input);
    if (anchor.kind === 'err') return anchor;
    return ok({ key: key.value, section, text: text.value, fact: fact.value, birth, anchor: anchor.value });
}

export function parseGateTally(input: unknown): Result<GateTally, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const stats = input.stats;
    if (!isRow(stats)) return err({ kind: 'not-a-row' });
    const parsed = statsOf(stats);
    if (parsed.kind === 'err') return parsed;
    return ok({ at: at.value, stats: parsed.value });
}
