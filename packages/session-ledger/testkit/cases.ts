import type { Case } from './run.ts';
import type { StoreUnderTest } from './memory-store.ts';
import { RECORD_CASES } from './store-cases/records.ts';

export const engineCases: readonly Case<unknown, unknown>[] = [];

export const storeCases: readonly Case<null, StoreUnderTest>[] = [...RECORD_CASES];
