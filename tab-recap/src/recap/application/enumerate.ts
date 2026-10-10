import type { Enumerators } from '#src/ports/enumerators.ts';
import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { jaccard } from '#src/recap/domain/gates/jaccard.ts';
import { answeredBy } from './enumerate-answer.ts';
import { enumerateInput } from './enumerate-input.ts';
import type { EnumerateMaterial, Question } from './enumerate-input.ts';
import { chunksOf, newestOf } from './chunking.ts';
import type { TurnChunk } from './chunking.ts';
import { capStubs, triggersOf } from './triggers.ts';
import type { Stub } from './triggers.ts';
import { tidy } from './recap-shape.ts';

const SAME = 0.6;

export interface EnumerateRun {
    readonly enumerator: Enumerators;
    readonly language: string;
    readonly tab: { readonly id: string; readonly now: number; readonly zone: string };
    log(line: string): void;
}

export interface AgentTurns {
    readonly agent: string;
    readonly entries: readonly Entry[];
}

export interface Enumeration {
    readonly candidates: readonly InputCandidate[];
    readonly cost: number;
    readonly chunks: number;
    readonly chars: number;
    readonly failed: string | null;
}

const flaggedOf = (stub: Stub, agent: string): InputCandidate =>
    ({ section: stub.section, text: tidy(stub.anchor, 16) || stub.anchor, why: null, ref: stub.ref, at: stub.at, anchor: stub.anchor, agent, flagged: true });

export function deduplicated(candidates: readonly InputCandidate[]): readonly InputCandidate[] {
    const kept: InputCandidate[] = [];
    for (const one of candidates) {
        const twin = kept.findIndex((each) => each.section === one.section && jaccard(each.text, one.text) >= SAME);
        if (twin < 0) {
            kept.push(one);
        } else if (kept[twin]?.flagged === true && !one.flagged) {
            kept[twin] = one;
        }
    }
    return kept;
}

interface Called {
    readonly candidates: readonly InputCandidate[];
    readonly cost: number;
    readonly failed: string | null;
}

async function called(run: EnumerateRun, material: EnumerateMaterial): Promise<Called> {
    const written = await run.enumerator.write(enumerateInput(material));
    if (isUnknown(written)) {
        return { candidates: [], cost: 0, failed: `${run.enumerator.backend} gave none (${saying(written.why)})` };
    }
    const answer = answeredBy(written.text, { agent: material.agent, entries: material.chunk.entries, stubs: material.stubs, clock: material.tab });
    if (answer === null) {
        return { candidates: [], cost: written.costUsd, failed: 'the enumeration answer is not a JSON object with "candidates"' };
    }
    const left = material.stubs.flatMap((stub, at) => (answer.filled.has(`g${at + 1}`) || answer.skipped.has(`g${at + 1}`) ? [] : [flaggedOf(stub, material.agent)]));
    run.log(`enumerate ${material.agent} ${material.position.index}/${material.position.of}: ${answer.candidates.length} candidates, ${left.length} flagged, ${answer.skipped.size} skipped, ${answer.lost} lost`);
    return { candidates: [...answer.candidates, ...left], cost: written.costUsd, failed: null };
}

export async function enumerate(run: EnumerateRun, agents: readonly AgentTurns[]): Promise<Enumeration> {
    const all: InputCandidate[] = [];
    let [cost, chunks, chars] = [0, 0, 0];
    for (const { agent, entries } of agents) {
        const parts: readonly TurnChunk[] = chunksOf(entries, run.tab);
        for (const [at, chunk] of parts.entries()) {
            const done = await called(run, { language: run.language, tab: run.tab, agent, chunk, position: { index: at + 1, of: parts.length }, stubs: capStubs(triggersOf(chunk.entries)), questions: [] });
            [cost, chunks, chars] = [cost + done.cost, chunks + 1, chars + chunk.markup.length];
            if (done.failed !== null) {
                return { candidates: [], cost, chunks, chars, failed: done.failed };
            }
            all.push(...done.candidates);
        }
    }
    return { candidates: deduplicated(all), cost, chunks, chars, failed: null };
}

export const ASK_BACK_CHARS = 24_000;

export async function enumerateAsked(run: EnumerateRun, agents: readonly AgentTurns[], questions: readonly Question[]): Promise<Enumeration> {
    const all: InputCandidate[] = [];
    let [cost, chars] = [0, 0];
    for (const { agent, entries } of agents) {
        const chunk = newestOf(entries, run.tab, ASK_BACK_CHARS);
        if (chunk === null) {
            continue;
        }
        const done = await called(run, { language: run.language, tab: run.tab, agent, chunk, position: { index: 1, of: 1 }, stubs: [], questions });
        [cost, chars] = [cost + done.cost, chars + chunk.markup.length];
        if (done.failed !== null) {
            return { candidates: [], cost, chunks: 0, chars, failed: done.failed };
        }
        all.push(...done.candidates);
    }
    return { candidates: all, cost, chunks: 1, chars, failed: null };
}
