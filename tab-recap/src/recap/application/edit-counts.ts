import { UNREAD } from '#src/ports/transcripts.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { registryOf } from '#src/ports/transcripts.ts';
import type { TranscriptRegistryInput } from '#src/ports/transcripts.ts';

const BUDGET_BYTES = 4 * 1024 * 1024;

export interface FileCount {
    readonly path: string;
    readonly count: number;
}

export function countEdits(paths: readonly string[]): readonly FileCount[] {
    const counts = new Map<string, number>();
    for (const path of paths) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return [...counts].map(([path, count]) => ({ path, count })).toSorted((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

export class EditCounts {
    private readonly transcripts: TranscriptRegistryInput;

    constructor(transcripts: TranscriptRegistryInput) {
        this.transcripts = transcripts;
    }

    private async editsOf(lane: LaneCursor): Promise<readonly string[]> {
        const reader = registryOf(this.transcripts).readerFor(lane.agent);
        if (reader === undefined || lane.transcript === '' || isScreenSource(lane.transcript)) {
            return [];
        }
        const chunk = await reader.read(lane.transcript, UNREAD, BUDGET_BYTES);
        return isUnknown(chunk) ? [] : chunk.entries.filter((entry) => entry.role === 'tool' && entry.kind === 'edit' && entry.text !== '').map((entry) => entry.text);
    }

    async of(lanes: readonly LaneCursor[]): Promise<readonly FileCount[]> {
        const found = await Promise.all(lanes.map((lane) => this.editsOf(lane)));
        return countEdits(found.flat());
    }
}

export class EditCache {
    private readonly counts: EditCounts;
    private readonly every: number;
    private found: readonly FileCount[] = [];
    private lastAt = Number.NEGATIVE_INFINITY;

    constructor(counts: EditCounts, every = 60_000) {
        this.counts = counts;
        this.every = every;
    }

    of(lanes: readonly LaneCursor[], now: number): readonly FileCount[] {
        if (now - this.lastAt >= this.every) {
            this.lastAt = now;
            void this.refresh(lanes);
        }
        return this.found;
    }

    private async refresh(lanes: readonly LaneCursor[]): Promise<void> {
        this.found = await this.counts.of(lanes);
    }
}
