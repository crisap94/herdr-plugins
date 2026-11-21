import { UNREAD } from '#src/ports/transcripts.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import { TRANSCRIPT_READ_BUDGET_BYTES } from './transcript-read-budget.ts';

type Ordering = -1 | 0 | 1;

export interface FileEdits {
    readonly path: Text;
    readonly count: Count;
}

export interface EditSource {
    of(lanes: readonly LaneCursor[]): Promise<readonly FileEdits[]>;
}

const REFRESH_EVERY: Milliseconds = must(parseMilliseconds(60_000));

export function countEdits(paths: readonly Text[]): readonly FileEdits[] {
    const counts = new Map<Text, number>();
    for (const path of paths) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    const byWeight = (a: FileEdits, b: FileEdits): Ordering => {
        if (a.count !== b.count) {
            return a.count > b.count ? -1 : 1;
        }
        const rank = a.path.localeCompare(b.path);
        if (rank < 0) {
            return -1;
        }
        return rank > 0 ? 1 : 0;
    };
    return [...counts].map(([path, count]) => ({ path, count: must(parseCount(count)) })).toSorted(byWeight);
}

export class EditTally implements EditSource {
    private readonly transcripts: TranscriptRegistry;

    constructor(transcripts: TranscriptRegistry) {
        this.transcripts = transcripts;
    }

    private async editsOf(lane: LaneCursor): Promise<readonly Text[]> {
        const reader = this.transcripts.readerFor(lane.agent);
        if (reader === undefined || lane.transcript === '' || isScreenSource(lane.transcript)) {
            return [];
        }
        const chunk = await reader.read(lane.transcript, UNREAD, TRANSCRIPT_READ_BUDGET_BYTES);
        return isUnknown(chunk) ? [] : chunk.entries.filter((entry) => entry.role === 'tool' && entry.kind === 'edit' && entry.text !== '').map((entry) => must(parseText(entry.text)));
    }

    async of(lanes: readonly LaneCursor[]): Promise<readonly FileEdits[]> {
        const found = await Promise.all(lanes.map((lane) => this.editsOf(lane)));
        return countEdits(found.flat());
    }
}

export class EditCache {
    private readonly counts: EditSource;
    private readonly every: Milliseconds;
    private found: readonly FileEdits[] = [];
    private lastAt = Number.NEGATIVE_INFINITY;

    constructor(counts: EditSource, every: Milliseconds = REFRESH_EVERY) {
        this.counts = counts;
        this.every = every;
    }

    of(lanes: readonly LaneCursor[], now: Instant): readonly FileEdits[] {
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
