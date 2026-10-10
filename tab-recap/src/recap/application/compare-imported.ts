import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import type { RunInputs, RunItem, StoredRun } from '#src/ports/run-inputs.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { coverDocument } from './judge-context.ts';
import { parseCover } from './judge-answer.ts';
import type { Grade } from './judge-answer.ts';
import { measureState, plus } from './judge-coverage.ts';
import type { Carrying, Share } from './judge-coverage.ts';
import { readBack } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

const SLACK_MS = 30 * 60_000;
const EVIDENCE_CHARS = 250_000;

export interface Side {
    readonly coverage: Share;
    readonly filler: Share;
    readonly readback: readonly Grade[] | null;
    readonly size: number;
}

export type ChapterResult =
    | { readonly kind: 'compared'; readonly n: number; readonly at: number; readonly keyfacts: number; readonly imported: Side; readonly replay: Side }
    | { readonly kind: 'skipped'; readonly n: number; readonly at: number; readonly why: string };

export interface Comparison {
    readonly chapters: readonly ChapterResult[];
    readonly total: { readonly imported: Pick<Side, 'coverage' | 'filler'> & { readonly readback: Share }; readonly replay: Pick<Side, 'coverage' | 'filler'> & { readonly readback: Share } };
    readonly costUsd: number;
}

export interface CompareDeps extends JudgeDeps {
    readonly label: string;
}

export const withoutLedgers = (document: string): string => document.replace(/<ledger\b[^>]*?(?:\/>|>[\s\S]*?<\/ledger>)/gu, '');

function evidenceOf(inputs: RunInputs, runs: readonly StoredRun[]): string {
    const documents = runs.flatMap((run) => withoutLedgers(inputs.document(run.id) ?? '') || []);
    let kept = documents;
    while (kept.length > 1 && kept.join('\n').length > EVIDENCE_CHARS) {
        kept = kept.slice(1);
    }
    return kept.join('\n');
}

async function carrying(deps: JudgeDeps, parts: { readonly input: string; readonly keyfacts: readonly string[] | null; readonly state: readonly RunItem[] }): Promise<{ readonly found: Carrying | string; readonly costUsd: number }> {
    const asked = await deps.judge.ask('cover', coverDocument(parts));
    if (isUnknown(asked)) {
        return { found: saying(asked.why), costUsd: 0 };
    }
    const parsed = parseCover(asked.text, new Map(parts.state.map((item) => [item.key, item.section])), parts.keyfacts);
    return { found: parsed.kind === 'ok' ? parsed.value : parsed.why, costUsd: asked.costUsd };
}

async function sideOf(deps: JudgeDeps, parts: { readonly input: string; readonly state: readonly RunItem[]; readonly found: Carrying }): Promise<{ readonly side: Side; readonly costUsd: number }> {
    const measured = measureState(parts.state, parts.found);
    const back = await readBack(deps, { items: parts.state, input: parts.input, keyfacts: parts.found.keyfacts });
    return { side: { coverage: measured.coverage, filler: measured.filler, readback: back.grades, size: parts.state.length }, costUsd: back.costUsd };
}

async function compareChapter(deps: CompareDeps, chapter: ImportedChapter, runs: readonly StoredRun[], since: number): Promise<{ readonly result: ChapterResult; readonly costUsd: number }> {
    const skip = (why: string, costUsd = 0): { result: ChapterResult; costUsd: number } => ({ result: { kind: 'skipped', n: chapter.n, at: chapter.at, why }, costUsd });
    const at = runs.findLast((run) => run.at <= chapter.at);
    const last = runs.at(-1);
    if (at === undefined || last === undefined || chapter.at > last.at + SLACK_MS) {
        return skip('the replay does not reach this chapter');
    }
    const state = deps.inputs.itemsOf(at.id, 'state');
    const input = evidenceOf(deps.inputs, runs.filter((run) => run.at > since && run.at <= at.at));
    if (state.length === 0 || input === '') {
        return skip('the replay has no ledger state or no input there');
    }
    const own = await carrying(deps, { input, keyfacts: null, state });
    if (typeof own.found === 'string') {
        return skip(`not judged: ${own.found}`, own.costUsd);
    }
    const theirs = await carrying(deps, { input, keyfacts: own.found.keyfacts, state: chapter.items });
    if (typeof theirs.found === 'string') {
        return skip(`not judged: ${theirs.found}`, own.costUsd + theirs.costUsd);
    }
    const [replay, imported] = [await sideOf(deps, { input, state, found: own.found }), await sideOf(deps, { input, state: chapter.items, found: theirs.found })];
    const costUsd = own.costUsd + theirs.costUsd + replay.costUsd + imported.costUsd;
    return { result: { kind: 'compared', n: chapter.n, at: chapter.at, keyfacts: own.found.keyfacts.length, imported: imported.side, replay: replay.side }, costUsd };
}

const NONE: Share = { passed: 0, total: 0 };
const passes = (side: Side): Share => ({ passed: side.readback?.filter((grade) => grade.pass).length ?? 0, total: side.readback === null ? 0 : 6 });

function totalOf(results: readonly ChapterResult[], pick: (result: ChapterResult & { kind: 'compared' }) => Side): Comparison['total']['imported'] {
    const compared = results.flatMap((result) => (result.kind === 'compared' ? [pick(result)] : []));
    return {
        coverage: compared.reduce((sum, side) => plus(sum, side.coverage), NONE), filler: compared.reduce((sum, side) => plus(sum, side.filler), NONE),
        readback: compared.reduce((sum, side) => plus(sum, passes(side)), NONE),
    };
}

export async function compareImported(deps: CompareDeps, chapters: readonly ImportedChapter[]): Promise<Comparison> {
    const runs = deps.inputs.runs({ tab: deps.label, since: null, limit: 100_000, withInput: true }).toReversed();
    const results: ChapterResult[] = [];
    let costUsd = 0;
    let since = Number.NEGATIVE_INFINITY;
    for (const chapter of chapters) {
        const done = await compareChapter(deps, chapter, runs, since);
        results.push(done.result);
        costUsd += done.costUsd;
        since = done.result.kind === 'compared' ? chapter.at : since;
    }
    return { chapters: results, total: { imported: totalOf(results, (each) => each.imported), replay: totalOf(results, (each) => each.replay) }, costUsd };
}
