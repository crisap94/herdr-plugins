import type { RecapRequest, Writer } from '#src/ports/summarizer.ts';

export function countedWriter(made: Writer, onWrite: () => void): Writer {
    return {
        backend: made.backend,
        contract: made.contract,
        write: (request: RecapRequest) => {
            onWrite();
            return made.write(request);
        },
    };
}
