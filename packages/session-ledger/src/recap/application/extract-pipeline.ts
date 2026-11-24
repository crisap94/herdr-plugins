import type { Enumerator } from '#src/ports/enumerators.ts';
import type { InputTranscript } from '#src/ports/recap-input.ts';
import type { RecapRequest, Writer } from '#src/ports/summarizer.ts';
import type { Usd } from '#src/contract/kernel.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { closeEvidenceGate } from '#src/recap/domain/gates/g13-close-evidence.ts';
import { gatesOf, retriesTargeted } from '#src/recap/domain/pipeline.ts';
import type { CloseEvidence, Pipeline } from '#src/recap/domain/pipeline.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { askBackFor } from './ask-back.ts';
import { instant } from '#src/recap/domain/time.ts';
import { deduplicated, enumerate, enumerateAsked } from './enumerate.ts';
import type { AgentTurns, EnumerateRun } from './enumerate.ts';
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
    readonly enumerator: Enumerator | null;
    readonly closeEvidence?: CloseEvidence;
    log(line: Text): void;
}

const text = brand<string, 'Text'>;
const count = brand<number, 'Count'>;
const usd = brand<number, 'Usd'>;
const turnsOf = (lanes: readonly InputTranscript[]): readonly AgentTurns[] => lanes.map((one) => ({ agent: text(one.agent), entries: one.entries }));

const costing = (done: Extracted, extra: Usd): Extracted => ({ ...done, cost: usd(done.cost + extra) });

const withCloseEvidence = (base: Ground, parts: PipelineParts): Ground => (parts.closeEvidence === 'on' ? { ...base, gates: [...base.gates, closeEvidenceGate] } : base);

export async function extractPiped(summarizer: Writer, request: RecapRequest, judging: Ground, parts: PipelineParts): Promise<Extracted> {
    const ground: Ground = withCloseEvidence(parts.pipeline === 'one' ? judging : { ...judging, gates: gatesOf(parts.pipeline), targeted: retriesTargeted(parts.pipeline) }, parts);
    const lanes = request.input.transcripts.filter((lane) => lane.entries.length > 0);
    const { enumerator } = parts;
    if (!STEPS[parts.pipeline].enumerate || enumerator === null || lanes.length === 0) {
        return extract(summarizer, request, ground);
    }
    const { id, now, zone } = request.input.tab;
    const run: EnumerateRun = { enumerator, language: text(request.language), tab: { id: text(id), now: instant(now), zone: text(zone) }, log: (line: Text) => { parts.log(line); } };
    const first = await enumerate(run, turnsOf(lanes));
    if (first.failed !== null) {
        parts.log(text(`enumeration failed, the run takes the single call: ${first.failed}`));
        return costing(await extract(summarizer, request, ground), usd(first.cost));
    }
    let [candidates, cost] = [first.candidates, Number(first.cost)];
    const asked = STEPS[parts.pipeline].askBack ? askBackFor({ chunks: count(first.chunks), chars: count(first.chars), candidates, open: request.input.ledgers.flatMap((ledger) => ledger.facts), said: text(lanes.flatMap((lane) => lane.entries.map((entry) => entry.text)).join('\n')) }) : [];
    if (asked.length > 0) {
        const more = await enumerateAsked(run, turnsOf(lanes), asked);
        cost += more.cost;
        parts.log(text(more.failed === null ? `ask-back: ${asked.length} questions, ${more.candidates.length} candidates` : `ask-back failed: ${more.failed}`));
        candidates = more.failed === null ? deduplicated([...candidates, ...more.candidates]) : candidates;
    }
    return costing(await extract(summarizer, reconcileRequest(request, candidates), ground), usd(cost));
}
