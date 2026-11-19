import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { FactId, RunId, Section } from '#src/recap/domain/fact.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { ItemsMode } from './twins/legacy.ts';

export type { GateCount, ItemsMode, RunInputs, RunItem, RunQuery, StoredRun } from './twins/legacy.ts';

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
