import type { Enumerators } from '#src/ports/enumerators.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { InputNote, InputTranscript, RecapInput } from '#src/ports/recap-input.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import type { Chunk, Entry } from '#src/ports/transcripts.ts';
import { SECTION_IDS, isSection } from '#src/recap/domain/fact.ts';
import type { Section } from '#src/recap/domain/fact.ts';
import type { LaneMark } from '#src/recap/domain/boundary.ts';
import { closeEvidenceGate } from '#src/recap/domain/gates/g13-close-evidence.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import type { Lane } from '#src/recap/domain/lane-shape.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { gatesOf, retriesTargeted } from '#src/recap/domain/pipeline.ts';
import type { CloseEvidence, Pipeline } from '#src/recap/domain/pipeline.ts';
import type { HiddenCounts, PositiveCount, WriterView } from '#src/recap/domain/writer-view.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import { askBackFor } from './ask-back.ts';
import { deduplicated, enumerate, enumerateAsked } from './enumerate.ts';
import type { EnumerateRun } from './enumerate.ts';
import { extract } from './extract-job.ts';
import type { Extracted, Ground } from './extract-job.ts';
import type { TaskFacts } from './ledger-input.ts';
import { localTime } from './local-time.ts';
import type { Built } from './recap-input.ts';
import { reconcileRequest } from './reconcile.ts';
import { clean, element, leaf } from './xml.ts';

export function anchorSource(input: RecapInput): string {
    const entries = input.transcripts.flatMap((lane) => lane.entries.flatMap((entry) => [entry.text, entry.what ?? '']));
    const notes = input.notes.map((note) => note.text);
    return foldedOf(clean([...entries, ...notes].join('\n')));
}

export interface Read {
    readonly lane: Pick<Lane, 'pane'>;
    readonly chunk: Chunk | null;
}

export function marksOf(reads: readonly Read[], now: number, advanced: boolean): readonly LaneMark[] {
    return reads.flatMap((read) => (read.chunk?.marks ?? []).flatMap((mark) => {
        if (mark.kind !== 'compacted' || (mark.at === null && !advanced) || read.chunk === null) {
            return [];
        }
        return [{
            pane: String(read.lane.pane), at: mark.at ?? now, cursor: read.chunk.position.cursor,
            ...(mark.tokensBefore === undefined ? {} : { tokensBefore: mark.tokensBefore }),
            ...(mark.tokensAfter === undefined ? {} : { tokensAfter: mark.tokensAfter }),
            ...(mark.tookMs === undefined ? {} : { tookMs: mark.tookMs }),
            ...(mark.trigger === undefined ? {} : { trigger: mark.trigger }),
        }];
    }));
}

const FILES_SHOWN = 5;

export function touchedFiles(entries: readonly Entry[]): readonly string[] {
    const seen: string[] = [];
    for (const entry of entries) {
        if (entry.role === 'tool' && entry.kind === 'edit' && entry.text !== '') {
            seen.splice(0, seen.length, ...seen.filter((known) => known !== entry.text), entry.text);
        }
    }
    return seen.slice(-FILES_SHOWN);
}

export function newest(lane: InputTranscript, max: number): InputTranscript {
    let used = 0;
    let from = lane.entries.length;
    while (from > 0 && (used + (lane.entries[from - 1]?.text.length ?? 0) <= max || from === lane.entries.length)) {
        used += lane.entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return { agent: lane.agent, entries: lane.entries.slice(from) };
}

export function candidatesOf(input: RecapInput): string {
    if (input.candidates === undefined) {
        return '';
    }
    const rows = input.candidates.map((one) => {
        const attrs = { section: one.section, anchor: one.anchor, why: one.why, ref: one.ref, agent: one.agent, at: one.at === null ? null : localTime(one.at, input.tab.now, input.tab.zone), flagged: one.flagged ? 'yes' : null };
        return `\n ${leaf('candidate', attrs, one.text)}`;
    }).join('');
    return `\n${element('candidates', {}, rows === '' ? '' : `${rows}\n`)}`;
}

const REPEAT_WINDOW_MS = 24 * 3_600_000;

export interface GroundWorld {
    readonly tab: string;
    readonly tasks: readonly TaskShape[];
    readonly built: Built;
    readonly entries: readonly Entry[];
    readonly ledger: Omit<Ledger, 'keysOf'>;
    readonly now: number;
    readonly language: string;
}

export function groundOf(world: GroundWorld): Ground {
    const { tab, tasks, built, now } = world;
    const source = anchorSource(built.input);
    const agents = built.input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => name.toLowerCase());
    return {
        gates: LEDGER_GATES, now, facts: new Map(built.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => [fact.id, fact] as const))),
        resolving: {
            tasks: tasks.map((task) => task.id), agents: built.input.agents, taskOf: built.numbering.taskOf,
            turns: world.entries.flatMap((entry) => (entry.at === undefined ? [] : [entry.at])), clock: { now, zone: built.input.tab.zone },
        },
        grounds: tasks.map((task) => ({
            key: task.id, tab, shown: built.numbering.shown.get(task.id) ?? new Map(),
            open: world.ledger.openOf({ tab, key: task.id }),
            closedLately: world.ledger.recentlyClosed({ tab, key: task.id }, now - REPEAT_WINDOW_MS), source, language: world.language, agents,
        })),
    };
}

export function serializeHidden(counts: HiddenCounts): string {
    return [...counts.entries()].toSorted(([a], [b]) => SECTION_IDS.indexOf(a) - SECTION_IDS.indexOf(b)).map(([section, count]) => `\n ${element('hidden', { section, count })}`).join('');
}

export function parseHidden(document: string): HiddenCounts {
    const counts = new Map<Section, PositiveCount>();
    for (const match of document.matchAll(/<hidden section="([^"]+)" count="(\d+)"\/>/gu)) {
        const section = match[1];
        const count = Number(match[2]);
        if (!isSection(section) || !Number.isSafeInteger(count) || count < 1 || counts.has(section)) {
            throw new Error('invalid hidden count');
        }
        counts.set(section, positiveCount(count));
    }
    if (document.replace(/<hidden section="[^"]+" count="\d+"\/>/gu, '').trim() !== '') {
        throw new Error('invalid hidden elements');
    }
    return counts;
}

export interface Observed {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly fresh: boolean;
}

export const idOf = (index: number): string => `a${index + 1}`;

export function notesOf(seen: Observed, agent: string): readonly InputNote[] {
    const all = seen.chunk?.notes ?? [];
    const found: readonly InputNote[] = all.filter((note, index) => !all.slice(index + 1).some((later) => later.kind === note.kind)).map((note) => ({ kind: note.kind, at: note.at, text: note.text, agent }));
    const left = seen.cursor.claudeRecap;
    return seen.fresh && left !== null && !found.some((note) => note.kind === 'away_summary') ? [{ kind: 'away_summary', at: null, text: left, agent }, ...found] : found;
}

export interface InputWorld {
    readonly tab: string;
    readonly repos: LaneRepo;
    readonly now: number;
    readonly tasks: readonly TaskShape[];
    readonly facts: readonly TaskFacts[];
    readonly writerView: WriterView;
}

const KEEP = { user: [700, 300], agent: [300, 900] } as const;

const GAP = '\n[…]\n';

export interface Clipped {
    readonly text: string;
    readonly clipped: boolean;
}

export function clipTurn(role: 'user' | 'agent', value: string): Clipped {
    const [head, tail] = KEEP[role];
    const body = value.trim();
    return body.length <= head + tail ? { text: body, clipped: false } : { text: `${body.slice(0, head).trimEnd()}${GAP}${body.slice(-tail).trimStart()}`, clipped: true };
}

export function clipHead(value: string, max: number): Clipped {
    const body = value.trim();
    return body.length <= max ? { text: body, clipped: false } : { text: body.slice(0, max).trimEnd(), clipped: true };
}

export interface PipelineParts {
    readonly pipeline: Pipeline;
    readonly enumerator: Enumerators | null;
    readonly closeEvidence?: CloseEvidence;
    log(line: string): void;
}

const STEPS: Readonly<Record<Pipeline, { readonly enumerate: boolean; readonly askBack: boolean }>> = {
    one: { enumerate: false, askBack: false },
    enumerate: { enumerate: true, askBack: false },
    'enumerate+gates': { enumerate: true, askBack: false },
    full: { enumerate: true, askBack: true },
};

const costing = (done: Extracted, extra: number): Extracted => ({ ...done, cost: done.cost + extra });

const withCloseEvidence = (base: Ground, parts: PipelineParts): Ground => (parts.closeEvidence === 'on' ? { ...base, gates: [...base.gates, closeEvidenceGate] } : base);

export async function extractPiped(summarizer: Summarizer, request: RecapRequest, judging: Ground, parts: PipelineParts): Promise<Extracted> {
    const ground: Ground = withCloseEvidence(parts.pipeline === 'one' ? judging : { ...judging, gates: gatesOf(parts.pipeline), targeted: retriesTargeted(parts.pipeline) }, parts);
    const lanes = request.input.transcripts.filter((lane) => lane.entries.length > 0);
    const { enumerator } = parts;
    if (!STEPS[parts.pipeline].enumerate || enumerator === null || lanes.length === 0) {
        return extract(summarizer, request, ground);
    }
    const run: EnumerateRun = { enumerator, language: request.language, tab: request.input.tab, log: (line) => { parts.log(line); } };
    const first = await enumerate(run, lanes);
    if (first.failed !== null) {
        parts.log(`enumeration failed, the run takes the single call: ${first.failed}`);
        return costing(await extract(summarizer, request, ground), first.cost);
    }
    let [candidates, cost] = [first.candidates, first.cost];
    const asked = STEPS[parts.pipeline].askBack ? askBackFor({ chunks: first.chunks, chars: first.chars, candidates, open: request.input.ledgers.flatMap((ledger) => ledger.facts), said: lanes.flatMap((lane) => lane.entries.map((entry) => entry.text)).join('\n') }) : [];
    if (asked.length > 0) {
        const more = await enumerateAsked(run, lanes, asked);
        cost += more.cost;
        parts.log(more.failed === null ? `ask-back: ${asked.length} questions, ${more.candidates.length} candidates` : `ask-back failed: ${more.failed}`);
        candidates = more.failed === null ? deduplicated([...candidates, ...more.candidates]) : candidates;
    }
    return costing(await extract(summarizer, reconcileRequest(request, candidates), ground), cost);
}
