import type { Enumerators } from '#src/ports/enumerators.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { gatesOf, retriesTargeted } from '#src/recap/domain/pipeline.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { askBackFor } from './ask-back.ts';
import { deduplicated, enumerate, enumerateAsked } from './enumerate.ts';
import type { EnumerateRun } from './enumerate.ts';
import { extract } from './extract-job.ts';
import type { Extracted, Ground } from './extract-job.ts';
import { reconcileRequest } from './reconcile.ts';

const STEPS: Readonly<Record<Pipeline, { readonly enumerate: boolean; readonly askBack: boolean }>> = {
    one: { enumerate: false, askBack: false },
    enumerate: { enumerate: true, askBack: false },
    'enumerate+gates': { enumerate: true, askBack: false },
    full: { enumerate: true, askBack: true },
};

export interface PipelineParts {
    readonly pipeline: Pipeline;
    readonly enumerator: Enumerators | null;
    log(line: string): void;
}

const costing = (done: Extracted, extra: number): Extracted => ({ ...done, cost: done.cost + extra });

export async function extractPiped(summarizer: Summarizer, request: RecapRequest, judging: Ground, parts: PipelineParts): Promise<Extracted> {
    const ground: Ground = parts.pipeline === 'one' ? judging : { ...judging, gates: gatesOf(parts.pipeline), targeted: retriesTargeted(parts.pipeline) };
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
