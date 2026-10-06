import { writeTx } from '#src/adapters/db/connection.ts';

export function save(db: Parameters<typeof writeTx>[0]): void {
    writeTx(db, () => { db.exec('UPDATE tab SET running = 0'); });
}
