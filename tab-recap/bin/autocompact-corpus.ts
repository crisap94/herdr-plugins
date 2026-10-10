import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalCatalogue } from '#src/adapters/model-catalogue.ts';
import { ExperimentStore } from '#src/adapters/experiment-store.ts';
import { recentTranscripts, sha256Of, withBoundaries } from '#src/adapters/experiment-files.ts';
import { pointOf, shareAt } from '#src/adapters/experiment-point.ts';
import type { Point } from '#src/adapters/experiment-point.ts';
import { eventsOf } from '#src/adapters/transcript-events.ts';
import { outcomesOf } from '#src/experiment/outcomes.ts';
import type { Outcome } from '#src/experiment/outcomes.ts';
import { stratify } from '#src/experiment/stratify.ts';
import type { Candidate } from '#src/experiment/stratify.ts';

const TEN_MINUTES = 10 * 60_000;
type Stored = ReturnType<ExperimentStore['frame']>[number];

const arg = (name: string): string => {
    const at = process.argv.indexOf(`--${name}`);
    const value = at < 0 ? undefined : process.argv[at + 1];
    if (value === undefined) throw new Error(`usage: autocompact-corpus.ts --db <file> --out <dir> (missing --${name})`);
    return value;
};

function lastBefore(boundaries: readonly number[], points: readonly Stored[]): ReadonlySet<string> {
    const picked = new Set<string>();
    boundaries.forEach((pos, n) => {
        const floor = boundaries[n - 1] ?? -1;
        const last = points.filter((point) => point.cursor <= pos && point.cursor > floor).toSorted((a, b) => b.cursor - a.cursor)[0];
        if (last !== undefined) picked.add(last.id);
    });
    return picked;
}

const jsonl = (items: readonly object[]): string => items.map((item) => JSON.stringify(item)).join('\n') + '\n';

const runBefore = (points: readonly Stored[], at: number | null): Stored | null =>
    at === null ? null : (points.filter((point) => point.at <= at && at - point.at <= TEN_MINUTES).toSorted((a, b) => b.at - a.at)[0] ?? null);

function outcomeRows(outcomes: ReadonlyMap<string, readonly Outcome[]>, bySource: ReadonlyMap<string, readonly Stored[]>, make: (stored: Stored) => Point | null): { readonly rows: readonly object[]; readonly extra: readonly Point[] } {
    const extra = new Map<string, Point>();
    const rows = [...outcomes].flatMap(([source, list]) => list.map((outcome) => {
        const stored = runBefore(bySource.get(source) ?? [], outcome.at);
        const point = stored === null ? null : make(stored);
        if (point !== null && point.stratum === 'outcome') extra.set(point.id, point);
        return { source, mtime: statSync(source).mtimeMs, ...outcome, point_id: point?.id ?? null };
    }));
    return { rows, extra: [...extra.values()] };
}

async function main(): Promise<void> {
    const [db, out] = [arg('db'), arg('out')];
    mkdirSync(out, { recursive: true });
    const [store, catalogue] = [new ExperimentStore(db), new LocalCatalogue()];
    const all = store.frame();
    const frame = all.filter((point) => existsSync(point.source));
    const bySource = new Map<string, Stored[]>();
    for (const point of frame) bySource.set(point.source, [...(bySource.get(point.source) ?? []), point]);
    const files = withBoundaries([...new Set([...recentTranscripts(join(homedir(), '.claude', 'projects'), 30), ...bySource.keys()])]);
    const outcomes = new Map<string, readonly Outcome[]>();
    for (const file of files) outcomes.set(file, outcomesOf(await eventsOf(file)));
    const before = new Set([...bySource].flatMap(([source, points]) => Array.from(lastBefore((outcomes.get(source) ?? []).map((o) => o.pos), points))));
    const candidates: Candidate[] = frame.map((point) => ({ id: point.id, share: shareAt(point.source, point.cursor, catalogue)?.share ?? null, beforeBoundary: before.has(point.id) }));
    const sampled = stratify(candidates);
    const strata = new Map(sampled.picked.map((pick) => [pick.id, pick.stratum]));
    const points = frame.flatMap((stored) => (strata.has(stored.id) ? [pointOf(store, catalogue, stored, strata.get(stored.id) ?? '')] : [])).filter((point) => point !== null);
    const made = outcomeRows(outcomes, bySource, (stored) => points.find((p) => p.id === stored.id) ?? pointOf(store, catalogue, stored, 'outcome'));
    store.close();
    const manifest = writeAll(out, db, { points, ...made }, { frame: frame.length, skipped: all.length - frame.length, strata: sampled.counts });
    console.log(JSON.stringify(manifest, null, 2));
}

function writeAll(out: string, db: string, data: { readonly points: readonly Point[]; readonly rows: readonly object[]; readonly extra: readonly Point[] }, counts: object): object {
    const files: Record<string, readonly object[]> = { 'corpus.jsonl': data.points, 'outcomes.jsonl': data.rows, 'outcome-points.jsonl': data.extra };
    for (const [name, items] of Object.entries(files)) writeFileSync(join(out, name), jsonl(items));
    const manifest = {
        seed: 42, ...counts, corpus: data.points.length, boundaries: data.rows.length, boundariesWithRun: data.rows.filter((r) => (r as { point_id: string | null }).point_id !== null).length,
        outcomePointsNotInSample: data.extra.length, db: { file: 'tab-recap.db', sha256: sha256Of(db) }, files: Object.fromEntries(Object.keys(files).map((name) => [name, sha256Of(join(out, name))])),
    };
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
