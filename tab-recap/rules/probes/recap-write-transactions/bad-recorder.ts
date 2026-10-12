export function recordClosure(db: { exec(sql: string): void }): void {
    db.exec('BEGIN');
    db.exec('INSERT OR IGNORE INTO closed_lane (tab_id, pane, closed_at, agent) VALUES (?, ?, ?, ?)');
    db.exec('COMMIT');
}
