export function count(db: { prepare(sql: string): { get(): unknown } }): unknown {
    return db.prepare('SELECT COUNT(*) FROM run').get();
}
