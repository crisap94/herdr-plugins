// The third step of a run: the writer is given the candidates and the ledger and answers operations on the ledger. The transcript stays, clipped,
// for context; a new fact comes only from a candidate and an id only from the ledger.
import type { InputCandidate, InputTranscript } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';

/** How much of each agent's newest turns the writer still sees in the reconcile step (characters of text). */
export const CONTEXT_CHARS = 12_000;

/** The newest entries whose text fits `max` characters (the newest is always kept). */
function newest(lane: InputTranscript, max: number): InputTranscript {
    let used = 0;
    let from = lane.entries.length;
    while (from > 0 && (used + (lane.entries[from - 1]?.text.length ?? 0) <= max || from === lane.entries.length)) {
        used += lane.entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return { agent: lane.agent, entries: lane.entries.slice(from) };
}

/** `request` for the reconcile step: with the `candidates` element, and the transcripts clipped. */
export function reconcileRequest(request: RecapRequest, candidates: readonly InputCandidate[]): RecapRequest {
    return { ...request, input: { ...request.input, candidates, transcripts: request.input.transcripts.map((lane) => newest(lane, CONTEXT_CHARS)) } };
}
