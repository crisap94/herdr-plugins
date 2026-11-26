import { createEngine } from '../../../../tab-recap/src/recap/application/engine.ts';
import { instant } from '../../../../packages/session-ledger/src/index.ts';
import { openStore } from '@stateforge-labs/session-ledger-sqlite';

export const probe = [createEngine, instant, openStore];
