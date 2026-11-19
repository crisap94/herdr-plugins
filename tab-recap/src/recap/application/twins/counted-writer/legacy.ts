import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';

export interface WriterCalls {
    writer: number;
}

export function countedWriter(made: Summarizer, calls: WriterCalls): Summarizer {
    return {
        backend: made.backend,
        contract: made.contract,
        write: (request: RecapRequest) => {
            calls.writer += 1;
            return made.write(request);
        },
    };
}
