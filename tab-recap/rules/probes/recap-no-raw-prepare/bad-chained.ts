export function ids(store: { db: { prepare(sql: string): { all(): unknown[] } } }): unknown[] {
    return store.db.prepare('SELECT id FROM tab').all();
}
