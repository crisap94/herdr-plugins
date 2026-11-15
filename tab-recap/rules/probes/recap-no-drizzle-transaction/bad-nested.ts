export function save(db: { transaction(work: () => void): void }): void {
    db.transaction(() => { db.transaction(() => {}); });
}
