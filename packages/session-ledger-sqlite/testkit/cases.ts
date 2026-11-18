import type { Case } from '@stateforge-labs/session-ledger/testkit';
import type { StoreSubject, StoreWorld } from './contract.ts';
import { backupCases } from './cases-backup.ts';
import { openCases } from './cases-open.ts';
import { roleCases } from './cases-role.ts';

export const storeMechanismCases: readonly Case<StoreWorld, StoreSubject>[] = [...openCases, ...backupCases, ...roleCases];
