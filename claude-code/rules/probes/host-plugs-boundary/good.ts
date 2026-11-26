import { must } from '@stateforge-labs/session-ledger';
import { RecapWriter } from '../../tab-recap/src/adapters/job/writer.ts';
import { restoreContentOf } from '../../tab-recap/src/recap/application/restore-text.ts';

export const probe = [must, RecapWriter, restoreContentOf];
