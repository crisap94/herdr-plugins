// How a run's new turns become operations: the pipeline. `one` is the single call of 2.0 (extract-job.ts); the others read the turns first
// (enumerate), optionally take one second look (ask-back), then reconcile the candidates with the ledger in the writer's call.
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

/** The steps of each pipeline; the gates it judges with and how it retries are `gatesOf` and `retriesTargeted` (domain/pipeline.ts). */
const STEPS: Readonly<Record<Pipeline, { readonly enumerate: boolean; readonly askBack: boolean }>> = {
    one: { enumerate: false, askBack: false },
    enumerate: { enumerate: true, askBack: false },
    'enumerate+gates': { enumerate: true, askBack: false },
    full: { enumerate: true, askBack: true },
};

export interface PipelineParts {
    readonly pipeline: Pipeline;
    /** null: there is no harness to enumerate with, and the run takes the single call */
    readonly enumerator: Enumerators | null;
    log(line: string): void;
}

const costing = (done: Extracted, extra: number): Extracted => ({ ...done, cost: done.cost + extra });

/** The run's operations, by the pipeline: what it cost includes every call it made. */
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
