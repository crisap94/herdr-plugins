import type { Store } from '#src/ports/store.ts';
import type { Fact } from '../fact.ts';

export type Gate = Store | Fact;
