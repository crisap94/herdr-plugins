import type { Case } from './run.ts';
import type { Engine } from '@stateforge-labs/session-ledger';
import type { StoreUnderTest } from './memory-store.ts';
import type { EngineWorld } from './world.ts';
import { FACT_CASES } from './store-cases/facts.ts';
import { RECORD_CASES } from './store-cases/records.ts';
import { CARRIED_CASES } from './store-cases/carried.ts';
import { FOL_CASES } from './engine-cases/follow.ts';
import { TRN_CASES } from './engine-cases/turn-ended.ts';
import { STA_CASES } from './engine-cases/session-started.ts';
import { FBY_CASES } from './engine-cases/followed-by.ts';
import { EVT_CASES } from './engine-cases/events.ts';
import { CMP_CASES } from './engine-cases/compacted.ts';
import { CUR_CASES } from './engine-cases/curate.ts';
import { HIS_CASES } from './engine-cases/history.ts';
import { REF_CASES } from './engine-cases/refresh.ts';
import { RUN_CASES } from './engine-cases/runs.ts';
import { CSR_CASES } from './engine-cases/cursors.ts';
import { LNG_CASES } from './engine-cases/language.ts';
import { RDF_CASES } from './engine-cases/read-failure.ts';
import { PRT_CASES } from './engine-cases/ports.ts';
import { LED_CASES } from './engine-cases/ledger.ts';

export const engineCases: readonly Case<EngineWorld, Engine>[] = [...FOL_CASES, ...TRN_CASES, ...STA_CASES, ...FBY_CASES, ...EVT_CASES, ...CMP_CASES, ...CUR_CASES, ...HIS_CASES, ...REF_CASES, ...RUN_CASES, ...CSR_CASES, ...LNG_CASES, ...RDF_CASES, ...PRT_CASES, ...LED_CASES];

export const storeCases: readonly Case<null, StoreUnderTest>[] = [...RECORD_CASES, ...CARRIED_CASES, ...FACT_CASES];
