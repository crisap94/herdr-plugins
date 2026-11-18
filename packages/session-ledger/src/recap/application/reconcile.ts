import type { InputCandidate, InputTranscript } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';

export const CONTEXT_CHARS = 12_000;

function newest(lane: InputTranscript, max: number): InputTranscript {
    let used = 0;
    let from = lane.entries.length;
    while (from > 0 && (used + (lane.entries[from - 1]?.text.length ?? 0) <= max || from === lane.entries.length)) {
        used += lane.entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return { agent: lane.agent, entries: lane.entries.slice(from) };
}

export function reconcileRequest(request: RecapRequest, candidates: readonly InputCandidate[]): RecapRequest {
    return { ...request, input: { ...request.input, candidates, transcripts: request.input.transcripts.map((lane) => newest(lane, CONTEXT_CHARS)) } };
}
