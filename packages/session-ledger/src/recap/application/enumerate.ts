import type { Count, Usd } from '#src/contract/kernel.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { jaccard } from '#src/recap/domain/gates/jaccard.ts';
import { answeredBy } from './enumerate-answer.ts';
import { enumerateInput, stubId } from './enumerate-input.ts';
import type { EnumerateMaterial, MaterialTab, Question } from './enumerate-input.ts';
import { chunksOf, newestOf } from './chunking.ts';
import type { TurnChunk, TurnClock } from './chunking.ts';
import { capStubs, triggersOf } from './triggers.ts';
import type { Stub } from './triggers.ts';
import { tidy } from './recap-shape.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;
const usd = brand<number, 'Usd'>;

const SAME = 0.6;

export interface EnumerateRun {
    readonly enumerator: Enumerators;
    readonly language: Text;
    readonly tab: MaterialTab;
    log(line: Text): void;
}

export interface AgentTurns {
    readonly agent: Text;
    readonly entries: readonly Entry[];
}

export interface Enumeration {
    readonly candidates: readonly InputCandidate[];
    readonly cost: Usd;
    readonly chunks: Count;
    readonly chars: Count;
    readonly failed: Text | null;
}

const flaggedOf = (stub: Stub, agent: Text): InputCandidate =>
    ({ section: stub.section, text: tidy(stub.anchor, count(16)) || stub.anchor, why: null, ref: stub.ref, at: stub.at, anchor: stub.anchor, agent, flagged: true });

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
    readonly cost: Usd;
    readonly failed: Text | null;
}

async function called(run: EnumerateRun, material: EnumerateMaterial): Promise<Called> {
    const written = await run.enumerator.write(enumerateInput(material));
    if (isUnknown(written)) {
        return { candidates: [], cost: usd(0), failed: textOf(`${run.enumerator.backend} gave none (${saying(written.why)})`) };
    }
    const answer = answeredBy(written.text, { agent: material.agent, entries: material.chunk.entries, stubs: material.stubs, clock: material.tab });
    if (answer === null) {
        return { candidates: [], cost: usd(written.costUsd), failed: textOf('the enumeration answer is not a JSON object with "candidates"') };
    }
    const left = material.stubs.flatMap((stub, at) => (answer.filled.has(stubId(count(at))) || answer.skipped.has(stubId(count(at))) ? [] : [flaggedOf(stub, material.agent)]));
    run.log(textOf(`enumerate ${material.agent} ${material.position.index}/${material.position.of}: ${answer.candidates.length} candidates, ${left.length} flagged, ${answer.skipped.size} skipped, ${answer.lost} lost`));
    return { candidates: [...answer.candidates, ...left], cost: usd(written.costUsd), failed: null };
}

export async function enumerate(run: EnumerateRun, agents: readonly AgentTurns[]): Promise<Enumeration> {
    const all: InputCandidate[] = [];
    const { now, zone } = run.tab;
    const clock: TurnClock = { now, zone };
    let [cost, chunks, chars] = [0, 0, 0];
    for (const { agent, entries } of agents) {
        const parts: readonly TurnChunk[] = chunksOf(entries, clock);
        for (const [at, chunk] of parts.entries()) {
            const done = await called(run, { language: run.language, tab: run.tab, agent, chunk, position: { index: count(at + 1), of: count(parts.length) }, stubs: capStubs(triggersOf(chunk.entries)), questions: [] });
            [cost, chunks, chars] = [cost + done.cost, chunks + 1, chars + chunk.markup.length];
            if (done.failed !== null) {
                return { candidates: [], cost: usd(cost), chunks: count(chunks), chars: count(chars), failed: done.failed };
            }
            all.push(...done.candidates);
        }
    }
    return { candidates: deduplicated(all), cost: usd(cost), chunks: count(chunks), chars: count(chars), failed: null };
}

export const ASK_BACK_CHARS = count(24_000);

export async function enumerateAsked(run: EnumerateRun, agents: readonly AgentTurns[], questions: readonly Question[]): Promise<Enumeration> {
    const all: InputCandidate[] = [];
    const { now, zone } = run.tab;
    const clock: TurnClock = { now, zone };
    let [cost, chars] = [0, 0];
    for (const { agent, entries } of agents) {
        const chunk = newestOf(entries, clock, ASK_BACK_CHARS);
        if (chunk === null) {
            continue;
        }
        const done = await called(run, { language: run.language, tab: run.tab, agent, chunk, position: { index: count(1), of: count(1) }, stubs: [], questions });
        [cost, chars] = [cost + done.cost, chars + chunk.markup.length];
        if (done.failed !== null) {
            return { candidates: [], cost: usd(cost), chunks: count(0), chars: count(chars), failed: done.failed };
        }
        all.push(...done.candidates);
    }
    return { candidates: all, cost: usd(cost), chunks: count(1), chars: count(chars), failed: null };
}
