import type { ImportedChapterItem, ImportedChapterRecord } from '#src/ports/imported-recaps.ts';
import type { JudgeEntry, RunInputReader, RunRecord } from '#src/ports/run-inputs.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { countOf, parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { parseUsd, type Usd } from '@stateforge-labs/session-ledger';
import { coverDocument } from './judge-context.ts';
import { parseCover } from './judge-answer.ts';
import type { Grade } from './judge-answer.ts';
import { measureState, plus } from './judge-coverage.ts';
import type { Carrying, Share } from './judge-coverage.ts';
import { readBack } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

export const withoutLedgers = (document: Text): Text => textOf(document.replace(/<ledger\b[^>]*?(?:\/>|>[\s\S]*?<\/ledger>)/gu, ''));

const SLACK_MS = 30 * 60_000;
const EVIDENCE_CHARS = 250_000;
const ZERO = must(parseUsd(0));

export interface Side {
    readonly coverage: Share;
    readonly filler: Share;
    readonly readback: readonly Grade[] | null;
    readonly size: Count;
}

interface ComparedChapter {
    readonly kind: 'compared';
    readonly n: Count;
    readonly at: Instant;
    readonly keyfacts: Count;
    readonly imported: Side;
    readonly replay: Side;
}

interface SkippedChapter {
    readonly kind: 'skipped';
    readonly n: Count;
    readonly at: Instant;
    readonly why: Text;
}

export type ChapterResult = ComparedChapter | SkippedChapter;

interface SideTotal extends Pick<Side, 'coverage' | 'filler'> {
    readonly readback: Share;
}

interface ComparisonTotal {
    readonly imported: SideTotal;
    readonly replay: SideTotal;
}

export interface Comparison {
    readonly chapters: readonly ChapterResult[];
    readonly total: ComparisonTotal;
    readonly costUsd: Usd;
}

interface CarryParts {
    readonly input: Text;
    readonly prior: Carrying | null;
    readonly state: readonly JudgeEntry[];
}

interface Carried {
    readonly found: Carrying | Text;
    readonly costUsd: Usd;
}

interface SideParts {
    readonly input: Text;
    readonly state: readonly JudgeEntry[];
    readonly found: Carrying;
}

interface SideOutcome {
    readonly side: Side;
    readonly costUsd: Usd;
}

interface ChapterOutcome {
    readonly result: ChapterResult;
    readonly costUsd: Usd;
}

export interface CompareDeps extends JudgeDeps {
    readonly label: ScopeId;
}

function evidenceOf(inputs: RunInputReader, runs: readonly RunRecord[]): Text | null {
    const documents = runs.flatMap((run) => {
        const kept = withoutLedgers(inputs.document(run.id) ?? textOf(''));
        return kept === '' ? [] : [kept];
    });
    let kept = documents;
    while (kept.length > 1 && kept.join('\n').length > EVIDENCE_CHARS) {
        kept = kept.slice(1);
    }
    const joined = kept.join('\n');
    return joined === '' ? null : must(parseText(joined));
}

const entryOf = (item: ImportedChapterItem): JudgeEntry => ({ key: item.key, section: item.section, text: item.text, birth: item.born ? 'born' : 'carried' });

async function carrying(deps: JudgeDeps, parts: CarryParts): Promise<Carried> {
    const asked = await deps.judge.ask('cover', coverDocument({ input: parts.input, keyfacts: parts.prior?.keyfacts ?? null, state: parts.state }));
    if (isUnknown(asked)) {
        return { found: must(parseText(saying(asked.why))), costUsd: ZERO };
    }
    const parsed = parseCover(asked.text, new Map(parts.state.map((item): [Text, Text] => [must(parseText(item.key)), must(parseText(item.section))])), parts.prior?.keyfacts ?? null);
    return { found: parsed.kind === 'ok' ? parsed.value : must(parseText(parsed.why)), costUsd: asked.costUsd };
}

async function sideOf(deps: JudgeDeps, parts: SideParts): Promise<SideOutcome> {
    const measured = measureState(parts.state, parts.found);
    const back = await readBack(deps, { items: parts.state, input: parts.input, keyfacts: parts.found.keyfacts });
    return { side: { coverage: measured.coverage, filler: measured.filler, readback: back.grades, size: must(parseCount(parts.state.length)) }, costUsd: must(parseUsd(back.costUsd)) };
}

async function compareChapter(deps: CompareDeps, chapter: ImportedChapterRecord, runs: readonly RunRecord[], since: Instant | null): Promise<ChapterOutcome> {
    const skip = (why: Text, costUsd: Usd = ZERO): ChapterOutcome => ({ result: { kind: 'skipped', n: chapter.n, at: chapter.at, why }, costUsd });
    const at = runs.findLast((run) => run.at <= chapter.at);
    const last = runs.at(-1);
    if (at === undefined || last === undefined || chapter.at > last.at + SLACK_MS) {
        return skip(must(parseText('the replay does not reach this chapter')));
    }
    const state = deps.inputs.itemsOf(at.id, 'state');
    const input = evidenceOf(deps.inputs, runs.filter((run) => (since === null || run.at > since) && run.at <= at.at));
    if (state.length === 0 || input === null) {
        return skip(must(parseText('the replay has no ledger state or no input there')));
    }
    const own = await carrying(deps, { input, prior: null, state });
    if (typeof own.found === 'string') {
        return skip(must(parseText(`not judged: ${own.found}`)), own.costUsd);
    }
    const theirs = await carrying(deps, { input, prior: own.found, state: chapter.items.map(entryOf) });
    if (typeof theirs.found === 'string') {
        return skip(must(parseText(`not judged: ${theirs.found}`)), must(parseUsd(own.costUsd + theirs.costUsd)));
    }
    const [replay, imported] = [await sideOf(deps, { input, state, found: own.found }), await sideOf(deps, { input, state: chapter.items.map(entryOf), found: theirs.found })];
    const costUsd = must(parseUsd(own.costUsd + theirs.costUsd + replay.costUsd + imported.costUsd));
    return { result: { kind: 'compared', n: chapter.n, at: chapter.at, keyfacts: must(parseCount(own.found.keyfacts.length)), imported: imported.side, replay: replay.side }, costUsd };
}

const NONE: Share = { passed: must(parseCount(0)), total: must(parseCount(0)) };
const passes = (side: Side): Share => ({ passed: must(parseCount(side.readback?.filter((grade) => grade.pass === 'pass').length ?? 0)), total: must(parseCount(side.readback === null ? 0 : 6)) });

function totalOf(results: readonly ChapterResult[], pick: (result: ComparedChapter) => Side): SideTotal {
    const compared = results.flatMap((result) => (result.kind === 'compared' ? [pick(result)] : []));
    return {
        coverage: compared.reduce((sum, side) => plus(sum, side.coverage), NONE), filler: compared.reduce((sum, side) => plus(sum, side.filler), NONE),
        readback: compared.reduce((sum, side) => plus(sum, passes(side)), NONE),
    };
}

export async function compareImported(deps: CompareDeps, chapters: readonly ImportedChapterRecord[]): Promise<Comparison> {
    const runs = deps.inputs.runs({ tab: deps.label, since: null, limit: countOf(100_000), input: 'with-input' }).toReversed();
    const results: ChapterResult[] = [];
    let costUsd = ZERO;
    let since: Instant | null = null;
    for (const chapter of chapters) {
        const done = await compareChapter(deps, chapter, runs, since);
        results.push(done.result);
        costUsd = must(parseUsd(costUsd + done.costUsd));
        since = done.result.kind === 'compared' ? chapter.at : since;
    }
    return { chapters: results, total: { imported: totalOf(results, (each) => each.imported), replay: totalOf(results, (each) => each.replay) }, costUsd };
}
