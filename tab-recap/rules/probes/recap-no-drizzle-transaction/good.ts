import { writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';

export function save(db: Parameters<typeof writeTransaction>[0]): void {
    writeTransaction(db, () => {});
}
