export function begin(db: { exec(sql: string): void }): void {
    db.exec("BEGIN DEFERRED");
}
