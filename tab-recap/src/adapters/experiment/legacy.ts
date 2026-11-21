import type { Row } from '#src/adapters/transcripts/jsonl.ts';
import { must } from '#src/protocol/result.ts';
import { ExperimentStore } from './store.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { existsSync, readFileSync } from 'node:fs';
import type { Labelled as LabelledRow } from '#src/experiment/kappa-report.ts';
import type { Labelled } from './labeller.ts';

import { recentTranscriptsAt, sha256Digest, withBoundariesAt } from './files.ts';
import { eventsAt } from './events.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import type { Event } from '#src/experiment/outcomes.ts';
import { readLabelledAt, readPointsAt } from './data.ts';
import { noticing } from '../harness/confinement-notice.ts';
import { LIBRARY_IDS, LibraryHarness, type HarnessRuntime } from '../harness/library.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { LABELLER, LabelRunner } from './labeller.ts';
import type { Point } from './point.ts';
import { appendRecord, readRecords } from './io.ts';

const pathOf = (path: string): FsPath => must(parseFsPath(path));

export const readJsonl = (path: string): readonly unknown[] => {
    const values: unknown[] = [];
    if (!existsSync(path)) return values;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (line.trim() !== '') values.push(JSON.parse(line));
    }
    return values;
};

export const appendJsonl = (path: string, record: Row): void => {
    appendRecord(pathOf(path), record);
};

export const doneKeys = (path: string, key: string): ReadonlySet<string> => new Set(readRecords(pathOf(path)).map((record) => String(record[key])));

export const readPoints = (path: string): readonly Point[] => readPointsAt(pathOf(path));

export const readLabelled = (path: string): readonly LabelledRow[] => readLabelledAt(pathOf(path));

export const eventsOf = (path: string): Promise<readonly Event[]> => eventsAt(pathOf(path));

export const recentTranscripts = (root: string, days: number, now: number = Date.now()): readonly string[] => recentTranscriptsAt(pathOf(root), must(parseCount(days)), must(parseMilliseconds(now)));

export const withBoundaries = (files: readonly string[]): readonly string[] => withBoundariesAt(files.map((file) => pathOf(file)));

export const sha256Of = (path: string): string => sha256Digest(pathOf(path));

const TIMEOUT_MS = 15 * 60_000;

export class Labeller {
    private readonly runner: LabelRunner;

    constructor(runtime: HarnessRuntime, slots: number, log: (line: string) => void, settings: HarnessSettings = LABELLER, make: () => Harness = (): Harness => noticing(new LibraryHarness(runtime, LIBRARY_IDS.codex, TIMEOUT_MS), log)) {
        this.runner = new LabelRunner(make, must(parseCount(slots)), (line) => { log(line); }, settings);
    }

    get settings(): HarnessSettings {
        return this.runner.settings;
    }

    ask<T>(instructions: string, input: Row, parse: (reply: string) => T | null, name: string): Promise<Labelled<T>> {
        return this.runner.ask(must(parseText(instructions)), input, (reply) => parse(reply), must(parseText(name)));
    }
}

export const storeAt = (path: string, live?: string): ExperimentStore => (live === undefined ? new ExperimentStore(pathOf(path)) : new ExperimentStore(pathOf(path), pathOf(live)));
