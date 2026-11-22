import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';

export function countedWriter(made: Summarizer, onWrite: () => void): Summarizer {
    return {
        backend: made.backend,
        contract: made.contract,
        write: (request: RecapRequest) => {
            onWrite();
            return made.write(request);
        },
    };
}
