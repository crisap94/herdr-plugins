import type { ClosureReader } from '#src/ports/closed-lanes.ts';
import type { Ledger } from '#src/ports/ledger.ts';

export type ClosedReaders = Pick<ClosureReader, 'resolve'> & Pick<Ledger, 'allOf'>;
