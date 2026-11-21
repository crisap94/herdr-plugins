import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { newest } from './legacy.ts';

export const CONTEXT_CHARS = 12_000;

export function reconcileRequest(request: RecapRequest, candidates: readonly InputCandidate[]): RecapRequest {
    return { ...request, input: { ...request.input, candidates, transcripts: request.input.transcripts.map((lane) => newest(lane, CONTEXT_CHARS)) } };
}
