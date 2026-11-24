import type { RecapRequest } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';

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
