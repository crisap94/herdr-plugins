import type { Case } from './run.ts';
import type { Engine } from '@stateforge-labs/session-ledger';
import type { StoreUnderTest } from './memory-store.ts';
import type { EngineWorld } from './world.ts';
import { FACT_CASES } from './store-cases/facts.ts';
import { RECORD_CASES } from './store-cases/records.ts';
import { FOL_CASES } from './engine-cases/follow.ts';
import { TRN_CASES } from './engine-cases/turn-ended.ts';
import { STA_CASES } from './engine-cases/session-started.ts';

export const engineCases: readonly Case<EngineWorld, Engine>[] = [...FOL_CASES, ...TRN_CASES, ...STA_CASES];

export const storeCases: readonly Case<null, StoreUnderTest>[] = [...RECORD_CASES, ...FACT_CASES];
