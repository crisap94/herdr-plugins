import type { Summarizer } from '#src/ports/summarizer.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';

export function countedWriter(made: Summarizer, calls: { writer: number }): Summarizer {
    return {
        backend: made.backend,
        contract: made.contract,
        write: (request: RecapRequest) => {
            calls.writer += 1;
            return made.write(request);
        },
    };
}
